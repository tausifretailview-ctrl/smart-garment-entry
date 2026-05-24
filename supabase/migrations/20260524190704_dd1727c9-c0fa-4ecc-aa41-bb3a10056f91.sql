
-- =============================================================================
-- customer_accounts_consistency_v1
-- Unify CN / Advance application into a single RPC contract that writes one
-- voucher_entry inline, caps to actual outstanding, and stops touching legacy
-- credit_applied. Aligns apply_credit_note_to_sale to the same footprint.
-- =============================================================================

-- Drop old boolean signature first; we change return type to jsonb.
DROP FUNCTION IF EXISTS public.adjust_invoice_balance(uuid, uuid, text, uuid, numeric, uuid, text);

CREATE OR REPLACE FUNCTION public.adjust_invoice_balance(
    p_organization_id uuid,
    p_invoice_id uuid,
    p_adjustment_type text,
    p_source_document_id uuid,
    p_amount_applied numeric,
    p_adjusted_by uuid DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_net_amount         NUMERIC;
    v_paid_amount        NUMERIC;
    v_sale_return_adjust NUMERIC;
    v_current_status     TEXT;
    v_sale_number        TEXT;
    v_deleted_at         TIMESTAMPTZ;
    v_is_cancelled       BOOLEAN;
    v_invoice_balance    NUMERIC;
    v_amount             NUMERIC;
    v_new_sr_adjust      NUMERIC;
    v_new_status         TEXT;

    v_source_total_amount NUMERIC;
    v_source_used_amount  NUMERIC;
    v_source_balance      NUMERIC;

    v_voucher_number   TEXT;
    v_voucher_entry_id UUID;
    v_payment_method   TEXT;
    v_description      TEXT;
    v_today            DATE := CURRENT_DATE;
BEGIN
    IF p_amount_applied IS NULL OR p_amount_applied <= 0 THEN
        RAISE EXCEPTION 'Amount applied must be positive';
    END IF;

    SELECT net_amount, paid_amount, sale_return_adjust, payment_status,
           sale_number, deleted_at, COALESCE(is_cancelled, false)
      INTO v_net_amount, v_paid_amount, v_sale_return_adjust, v_current_status,
           v_sale_number, v_deleted_at, v_is_cancelled
      FROM sales
     WHERE id = p_invoice_id AND organization_id = p_organization_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale/Invoice not found';
    END IF;

    IF v_deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot adjust a deleted invoice';
    END IF;
    IF v_is_cancelled THEN
        RAISE EXCEPTION 'Cannot adjust a cancelled invoice';
    END IF;
    IF v_current_status IN ('hold', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot adjust invoice in status %', v_current_status;
    END IF;

    v_invoice_balance := COALESCE(v_net_amount, 0)
                       - COALESCE(v_paid_amount, 0)
                       - COALESCE(v_sale_return_adjust, 0);

    IF v_invoice_balance <= 0.01 THEN
        RAISE EXCEPTION 'Invoice has no outstanding balance to adjust';
    END IF;

    -- Cap at outstanding.
    v_amount := LEAST(p_amount_applied, v_invoice_balance);

    -- Update source pool (CN / advance) with the capped amount.
    IF p_adjustment_type = 'CREDIT_NOTE' THEN
        SELECT credit_amount, used_amount INTO v_source_total_amount, v_source_used_amount
          FROM credit_notes
         WHERE id = p_source_document_id AND organization_id = p_organization_id
         FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Credit Note not found';
        END IF;

        v_source_balance := COALESCE(v_source_total_amount, 0) - COALESCE(v_source_used_amount, 0);

        IF v_source_balance < v_amount THEN
            RAISE EXCEPTION 'Adjustment amount exceeds available credit note balance';
        END IF;

        UPDATE credit_notes
           SET used_amount = COALESCE(used_amount, 0) + v_amount,
               status = CASE
                          WHEN (COALESCE(credit_amount, 0) - (COALESCE(used_amount, 0) + v_amount)) <= 0.01 THEN 'fully_used'
                          ELSE 'partially_used'
                        END,
               updated_at = NOW()
         WHERE id = p_source_document_id;

        v_payment_method := 'credit_note_adjustment';
        v_description    := 'Credit note adjusted (₹' || v_amount || ') against ' || COALESCE(v_sale_number, p_invoice_id::text);

    ELSIF p_adjustment_type = 'ADVANCE_PAYMENT' THEN
        SELECT amount, used_amount INTO v_source_total_amount, v_source_used_amount
          FROM customer_advances
         WHERE id = p_source_document_id AND organization_id = p_organization_id
         FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Advance Payment not found';
        END IF;

        v_source_balance := COALESCE(v_source_total_amount, 0) - COALESCE(v_source_used_amount, 0);

        IF v_source_balance < v_amount THEN
            RAISE EXCEPTION 'Adjustment amount exceeds available advance balance';
        END IF;

        UPDATE customer_advances
           SET used_amount = COALESCE(used_amount, 0) + v_amount,
               status = CASE
                          WHEN (COALESCE(amount, 0) - (COALESCE(used_amount, 0) + v_amount)) <= 0.01 THEN 'fully_used'
                          ELSE 'partially_used'
                        END,
               updated_at = NOW()
         WHERE id = p_source_document_id;

        v_payment_method := 'advance_adjustment';
        v_description    := 'Advance adjusted (₹' || v_amount || ') against ' || COALESCE(v_sale_number, p_invoice_id::text);
    ELSE
        RAISE EXCEPTION 'Unsupported adjustment type: %', p_adjustment_type;
    END IF;

    -- Apply to sale via sale_return_adjust (Option A); stop writing legacy credit_applied.
    v_new_sr_adjust := COALESCE(v_sale_return_adjust, 0) + v_amount;

    IF (COALESCE(v_net_amount, 0) - (COALESCE(v_paid_amount, 0) + v_new_sr_adjust)) <= 0.01 THEN
        v_new_status := 'completed';
    ELSIF (COALESCE(v_paid_amount, 0) + v_new_sr_adjust) > 0 THEN
        v_new_status := 'partial';
    ELSE
        v_new_status := 'pending';
    END IF;

    UPDATE sales
       SET sale_return_adjust = v_new_sr_adjust,
           payment_status     = v_new_status,
           updated_at         = NOW()
     WHERE id = p_invoice_id;

    -- Single voucher writer: insert receipt voucher inline.
    v_voucher_number := public.generate_voucher_number('receipt', v_today);

    INSERT INTO voucher_entries (
        organization_id, voucher_number, voucher_type, voucher_date,
        reference_type, reference_id, description, total_amount,
        payment_method, created_by
    ) VALUES (
        p_organization_id, v_voucher_number, 'receipt', v_today,
        'sale', p_invoice_id, v_description, v_amount,
        v_payment_method, p_adjusted_by
    )
    RETURNING id INTO v_voucher_entry_id;

    -- Audit trail.
    INSERT INTO invoice_adjustments (
        organization_id, invoice_id, adjustment_type, source_document_id,
        amount_applied, adjusted_by, notes
    ) VALUES (
        p_organization_id, p_invoice_id, p_adjustment_type, p_source_document_id,
        v_amount, p_adjusted_by, p_notes
    );

    RETURN jsonb_build_object(
        'success',            true,
        'voucher_entry_id',   v_voucher_entry_id,
        'voucher_number',     v_voucher_number,
        'amount_applied',     v_amount,
        'sale_return_adjust', v_new_sr_adjust,
        'payment_status',     v_new_status
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.adjust_invoice_balance(uuid, uuid, text, uuid, numeric, uuid, text) TO authenticated;

-- =============================================================================
-- apply_credit_note_to_sale: align with Option A footprint + atomic numbering.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.apply_credit_note_to_sale(
  p_customer_id     uuid,
  p_sale_id         uuid,
  p_apply_amount    numeric,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_note            RECORD;
  v_sale            RECORD;
  v_outstanding     NUMERIC;
  v_to_apply        NUMERIC;
  v_remaining       NUMERIC;
  v_applied_total   NUMERIC := 0;
  v_notes_used      TEXT[]  := '{}';
  v_amount_from_note NUMERIC;
  v_new_used        NUMERIC;
  v_voucher_number  TEXT;
  v_new_sr_adjust   NUMERIC;
  v_new_status      TEXT;
BEGIN
  IF p_apply_amount IS NULL OR p_apply_amount <= 0 THEN
    RAISE EXCEPTION 'Apply amount must be positive';
  END IF;

  SELECT * INTO v_sale FROM sales
   WHERE id = p_sale_id AND organization_id = p_organization_id
     AND deleted_at IS NULL AND COALESCE(is_cancelled, false) = false
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;

  IF v_sale.customer_id IS DISTINCT FROM p_customer_id THEN
    RAISE EXCEPTION 'Sale does not belong to this customer';
  END IF;

  IF v_sale.payment_status IN ('hold', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot apply credit to invoice in status %', v_sale.payment_status;
  END IF;

  v_outstanding := COALESCE(v_sale.net_amount, 0)
                 - COALESCE(v_sale.paid_amount, 0)
                 - COALESCE(v_sale.sale_return_adjust, 0);

  IF v_outstanding <= 0.01 THEN
    RAISE EXCEPTION 'Invoice has no outstanding balance';
  END IF;

  v_to_apply := LEAST(p_apply_amount, v_outstanding);
  v_remaining := v_to_apply;

  FOR v_note IN
    SELECT * FROM credit_notes
     WHERE customer_id = p_customer_id
       AND organization_id = p_organization_id
       AND status IN ('active', 'partially_used')
       AND deleted_at IS NULL
     ORDER BY created_at
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_amount_from_note := LEAST(v_remaining,
                                v_note.credit_amount - COALESCE(v_note.used_amount, 0));
    IF v_amount_from_note <= 0 THEN CONTINUE; END IF;

    v_new_used := COALESCE(v_note.used_amount, 0) + v_amount_from_note;

    UPDATE credit_notes
       SET used_amount = v_new_used,
           status = CASE
                      WHEN v_new_used >= v_note.credit_amount THEN 'fully_used'
                      WHEN v_new_used > 0 THEN 'partially_used'
                      ELSE 'active'
                    END,
           updated_at = NOW()
     WHERE id = v_note.id;

    v_applied_total := v_applied_total + v_amount_from_note;
    v_remaining := v_remaining - v_amount_from_note;
    v_notes_used := array_append(v_notes_used, v_note.credit_note_number);
  END LOOP;

  IF v_applied_total <= 0 THEN
    RAISE EXCEPTION 'No credit available for this customer';
  END IF;

  v_voucher_number := public.generate_voucher_number('receipt', CURRENT_DATE);

  INSERT INTO voucher_entries (
    organization_id, voucher_number, voucher_type, voucher_date,
    reference_type, reference_id, description, total_amount, payment_method
  ) VALUES (
    p_organization_id, v_voucher_number, 'receipt', CURRENT_DATE,
    'sale', p_sale_id,
    'CN Adjusted (₹' || v_applied_total || ') from '
      || array_to_string(v_notes_used, ', ') || ' to ' || v_sale.sale_number,
    v_applied_total, 'credit_note_adjustment'
  );

  -- Option A: post-hoc CN reduces receivable via sale_return_adjust.
  v_new_sr_adjust := COALESCE(v_sale.sale_return_adjust, 0) + v_applied_total;

  IF (COALESCE(v_sale.net_amount, 0) - (COALESCE(v_sale.paid_amount, 0) + v_new_sr_adjust)) <= 0.01 THEN
    v_new_status := 'completed';
  ELSIF (COALESCE(v_sale.paid_amount, 0) + v_new_sr_adjust) > 0 THEN
    v_new_status := 'partial';
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE sales
     SET sale_return_adjust = v_new_sr_adjust,
         payment_status     = v_new_status,
         updated_at         = NOW()
   WHERE id = p_sale_id;

  RETURN jsonb_build_object(
    'success',        true,
    'applied_amount', v_applied_total,
    'notes_used',     v_notes_used,
    'voucher_number', v_voucher_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_credit_note_to_sale(uuid, uuid, numeric, uuid) TO authenticated;
