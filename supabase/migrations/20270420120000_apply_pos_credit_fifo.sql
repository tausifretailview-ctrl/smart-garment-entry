-- Plan Phase 2, step 4: apply a customer's credit notes to a POS bill in ONE transaction.
--
-- Until now the browser ran the FIFO itself (applyCreditNoteFifoToSale): read the customer's
-- sale returns and credit notes, then per credit note re-read the return, create a credit
-- note if missing, check headroom, call apply_pos_credit, read the note back and update the
-- return: about 8 requests per credit note. A dropped connection or an error half way left
-- part of the credit applied.
--
-- apply_pos_credit_fifo does the same steps in the database, in one transaction:
--   * same pool as getAvailableCN(includeUnlinkedAdjusted): the customer's returns that are
--     pending / partially_adjusted / adjusted_outstanding, or adjusted with no linked bill;
--     never cash refunds; never a return already absorbed into a bill at billing;
--   * same available amount (live credit_notes remaining when the note exists, else the
--     return's credit_available_balance, else its net), oldest return first;
--   * a missing credit note is created the same way (generate_credit_note_number);
--   * each note is applied through the existing apply_pos_credit (idempotency key
--     "<key>:<credit note id>", adjust_invoice_balance, voucher, used_amount trigger);
--   * the return's credit_available_balance / credit_status / linked_sale_id are updated;
--   * paid_amount / payment_status are settled with compute_sale_settlement.
-- Pressing again with the same key after a lost reply returns what was applied (no double
-- credit, no false error). If the pool cannot cover the amount, NOTHING is applied (before, the notes applied so far
-- stayed applied). A credit_available_balance above the note's live balance is lowered to it
-- (heal-down, as ensureCreditNoteHeadroom documents) instead of failing the bill.
-- SECURITY INVOKER: runs as the signed-in user with the same RLS as the browser steps.
-- UNDO: DROP FUNCTION public.apply_pos_credit_fifo(uuid, uuid, uuid, numeric, text, uuid, text);
--       (the app then runs the FIFO in the browser, as before.)

CREATE OR REPLACE FUNCTION public.apply_pos_credit_fifo(
  p_organization_id uuid,
  p_sale_id uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_idempotency_key text,
  p_adjusted_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_requested numeric;
  v_remaining numeric;
  v_applied numeric := 0;
  v_chunks jsonb := '[]'::jsonb;
  r record;
  v_cn record;
  v_has_cn boolean;
  v_cab numeric;
  v_avail numeric;
  v_use numeric;
  v_cn_id uuid;
  v_cn_number text;
  v_cn_left numeric;
  v_res jsonb;
  v_amount_done numeric;
  v_new_paid numeric;
  v_new_status text;
  v_settled boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  IF p_sale_id IS NULL OR p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Bill and customer are required' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'Credit apply requires an idempotency key.' USING ERRCODE = '22023';
  END IF;

  v_requested := round(GREATEST(0, coalesce(p_amount, 0)), 2);
  IF v_requested <= 0.01 THEN
    RETURN jsonb_build_object('applied', 0, 'chunks', '[]'::jsonb, 'settled', false);
  END IF;
  v_remaining := v_requested;

  PERFORM set_config('statement_timeout', '60s', true);

  -- Same key already applied in full (the reply was lost and the cashier pressed again):
  -- answer with what was applied instead of applying or failing again.
  SELECT coalesce(sum(ia.amount_applied), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'sale_return_id', NULL,
           'credit_note_id', ia.source_document_id,
           'voucher_entry_id', NULL,
           'voucher_number', NULL,
           'amount', ia.amount_applied,
           'already_applied', true
         ) ORDER BY ia.created_at), '[]'::jsonb)
    INTO v_applied, v_chunks
  FROM public.invoice_adjustments ia
  WHERE ia.organization_id = p_organization_id
    AND ia.invoice_id = p_sale_id
    AND ia.adjustment_type = 'CREDIT_NOTE'
    AND left(ia.idempotency_key, length(btrim(p_idempotency_key)) + 1) = btrim(p_idempotency_key) || ':';
  IF v_applied >= v_requested - 0.01 THEN
    RETURN jsonb_build_object('applied', round(v_applied, 2), 'chunks', v_chunks, 'settled', false, 'already_applied', true);
  END IF;
  v_applied := 0;
  v_chunks := '[]'::jsonb;

  -- The customer's credit pool, oldest return first. Locked so two counters cannot apply the
  -- same credit at once.
  FOR r IN
    SELECT sr.id, sr.net_amount, sr.credit_available_balance, sr.credit_status, sr.credit_note_id,
           sr.linked_sale_id, sr.return_number, sr.return_date, sr.customer_name
    FROM public.sale_returns sr
    WHERE sr.organization_id = p_organization_id
      AND sr.customer_id = p_customer_id
      AND sr.deleted_at IS NULL
      AND sr.refund_type <> 'cash_refund'
      AND (
        sr.credit_status IN ('pending', 'partially_adjusted', 'adjusted_outstanding')
        OR (sr.credit_status = 'adjusted' AND sr.linked_sale_id IS NULL)
      )
    ORDER BY sr.return_date ASC NULLS FIRST, sr.created_at ASC, sr.id ASC
    FOR UPDATE OF sr
  LOOP
    EXIT WHEN v_remaining <= 0.01;

    -- Absorbed into a bill at billing: never apply again.
    IF lower(btrim(coalesce(r.credit_status, ''))) = 'adjusted'
       AND btrim(coalesce(r.linked_sale_id::text, '')) <> '' THEN
      CONTINUE;
    END IF;

    v_has_cn := false;
    IF r.credit_note_id IS NOT NULL THEN
      SELECT cn.id, cn.credit_amount, cn.used_amount
        INTO v_cn
      FROM public.credit_notes cn
      WHERE cn.id = r.credit_note_id
        AND cn.organization_id = p_organization_id
        AND cn.deleted_at IS NULL
      FOR UPDATE;
      v_has_cn := FOUND;
    END IF;

    v_cab := CASE WHEN r.credit_available_balance IS NULL THEN NULL
                  ELSE GREATEST(0, r.credit_available_balance) END;
    IF v_has_cn THEN
      v_avail := GREATEST(0, round(coalesce(v_cn.credit_amount, 0) - coalesce(v_cn.used_amount, 0), 2));
    ELSIF v_cab IS NOT NULL THEN
      v_avail := round(v_cab);
    ELSIF lower(coalesce(r.credit_status, '')) = 'refunded' THEN
      v_avail := 0;
    ELSE
      v_avail := round(GREATEST(0, coalesce(r.net_amount, 0)));
    END IF;
    CONTINUE WHEN v_avail <= 0.005;

    v_use := LEAST(v_avail, v_remaining);

    IF v_has_cn THEN
      v_cn_id := v_cn.id;
      -- Heal-down: the return shows more than the note has left.
      IF v_cab IS NOT NULL AND v_cab > v_avail + 0.01 THEN
        UPDATE public.sale_returns
        SET credit_available_balance = v_avail
        WHERE id = r.id AND organization_id = p_organization_id;
      END IF;
    ELSE
      -- No credit note yet: create it for what the return still has, and link it.
      v_cn_number := public.generate_credit_note_number(p_organization_id);
      INSERT INTO public.credit_notes (
        organization_id, credit_note_number, sale_id, customer_id, customer_name,
        credit_amount, used_amount, status, issue_date, notes
      ) VALUES (
        p_organization_id, v_cn_number, r.linked_sale_id, p_customer_id,
        coalesce(NULLIF(r.customer_name, ''), 'Walk-in Customer'),
        v_avail, 0, 'active',
        coalesce(r.return_date::date, (now() AT TIME ZONE 'Asia/Kolkata')::date),
        'Credit note from sale return ' || coalesce(r.return_number, r.id::text)
      )
      RETURNING id INTO v_cn_id;
      UPDATE public.sale_returns
      SET credit_note_id = v_cn_id
      WHERE id = r.id AND organization_id = p_organization_id;
    END IF;

    SELECT GREATEST(0, coalesce(cn.credit_amount, 0) - coalesce(cn.used_amount, 0))
      INTO v_cn_left
    FROM public.credit_notes cn WHERE cn.id = v_cn_id;
    IF v_use > coalesce(v_cn_left, 0) + 0.01 THEN
      RAISE EXCEPTION 'exceeds available credit note balance';
    END IF;

    v_res := public.apply_pos_credit(
      p_organization_id,
      p_sale_id,
      btrim(p_idempotency_key) || ':' || v_cn_id::text,
      v_cn_id,
      v_use,
      p_adjusted_by,
      p_notes
    );
    IF coalesce((v_res->>'already_applied')::boolean, false) = false
       AND coalesce(v_res->>'voucher_entry_id', '') = '' THEN
      RAISE EXCEPTION 'Receipt voucher missing after credit-note adjustment.';
    END IF;
    v_amount_done := round(coalesce((v_res->>'amount_applied')::numeric, v_use), 2);

    -- The return follows its note: what is left, adjusted / partially adjusted, this bill.
    SELECT GREATEST(0, coalesce(cn.credit_amount, 0) - coalesce(cn.used_amount, 0))
      INTO v_cn_left
    FROM public.credit_notes cn WHERE cn.id = v_cn_id;
    UPDATE public.sale_returns
    SET credit_available_balance = v_cn_left,
        credit_status = CASE WHEN v_cn_left <= 0.01 THEN 'adjusted' ELSE 'partially_adjusted' END,
        linked_sale_id = p_sale_id
    WHERE id = r.id AND organization_id = p_organization_id;

    v_chunks := v_chunks || jsonb_build_array(jsonb_build_object(
      'sale_return_id', r.id,
      'credit_note_id', v_cn_id,
      'voucher_entry_id', v_res->>'voucher_entry_id',
      'voucher_number', v_res->>'voucher_number',
      'amount', v_amount_done,
      'already_applied', coalesce((v_res->>'already_applied')::boolean, false)
    ));
    v_remaining := v_remaining - v_amount_done;
    v_applied := v_applied + v_amount_done;
  END LOOP;

  v_applied := round(v_applied, 2);
  IF v_applied < v_requested - 0.01 THEN
    RAISE EXCEPTION 'Insufficient credit note balance. Applied ₹%, requested ₹%.', v_applied, v_requested
      USING ERRCODE = 'P0001';
  END IF;

  -- Settle paid / status like applyRecomputedSalePaymentState; a failure keeps the credit.
  BEGIN
    SELECT c.new_paid, c.new_status INTO v_new_paid, v_new_status
    FROM public.compute_sale_settlement(p_sale_id, p_organization_id) c;
    IF v_new_paid IS NOT NULL THEN
      UPDATE public.sales
      SET paid_amount = round(v_new_paid, 2),
          payment_status = coalesce(v_new_status, 'pending')
      WHERE id = p_sale_id
        AND organization_id = p_organization_id
        AND (abs(coalesce(paid_amount, 0) - round(v_new_paid, 2)) > 0.009
             OR coalesce(payment_status, '') IS DISTINCT FROM coalesce(v_new_status, 'pending'));
      v_settled := true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'apply_pos_credit_fifo: settlement check skipped for sale %: %', p_sale_id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'applied', v_applied,
    'chunks', v_chunks,
    'settled', v_settled,
    'paid_amount', v_new_paid,
    'payment_status', v_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_pos_credit_fifo(uuid, uuid, uuid, numeric, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_pos_credit_fifo(uuid, uuid, uuid, numeric, text, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.apply_pos_credit_fifo(uuid, uuid, uuid, numeric, text, uuid, text) IS
  'Applies a customer''s credit notes (oldest return first) to a POS bill in one transaction (Plan Phase 2 step 4).';
