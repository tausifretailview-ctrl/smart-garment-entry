-- Cancel / delete / edit must release only the credit this sale actually used.
-- Soft-deleting the credit_note_adjustment voucher lets trg_cn_adjust_sync
-- rewrite credit_notes.used_amount. The return's available balance then follows
-- the note, not the return's original net.

CREATE OR REPLACE FUNCTION public.restore_linked_returns_after_credit_release(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE public.sale_returns sr
     SET credit_available_balance = GREATEST(
           0,
           COALESCE(cn.credit_amount, 0) - COALESCE(cn.used_amount, 0)
         ),
         credit_status = CASE
           WHEN GREATEST(0, COALESCE(cn.credit_amount, 0) - COALESCE(cn.used_amount, 0)) <= 0.01
             THEN 'adjusted'
           WHEN GREATEST(0, COALESCE(cn.credit_amount, 0) - COALESCE(cn.used_amount, 0)) + 0.01
                < COALESCE(sr.net_amount, 0)
             THEN 'partially_adjusted'
           ELSE 'pending'
         END,
         linked_sale_id = NULL
    FROM public.credit_notes cn
   WHERE sr.linked_sale_id = p_sale_id
     AND sr.deleted_at IS NULL
     AND sr.credit_status IN ('adjusted', 'partially_adjusted')
     AND cn.id = sr.credit_note_id
     AND cn.deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_linked_returns_after_credit_release(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_linked_returns_after_credit_release(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.release_sale_credit(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.sales WHERE id = p_sale_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated'
         AND NOT (v_org IN (SELECT public.get_user_organization_ids(auth.uid())))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  UPDATE public.voucher_entries
     SET deleted_at = NOW(),
         deleted_by = auth.uid()
   WHERE reference_id = p_sale_id
     AND deleted_at IS NULL
     AND payment_method = 'credit_note_adjustment';

  PERFORM public.restore_linked_returns_after_credit_release(p_sale_id);

  UPDATE public.sales
     SET sale_return_adjust = 0,
         updated_at = NOW()
   WHERE id = p_sale_id
     AND deleted_at IS NULL;

  RETURN jsonb_build_object('success', true, 'sale_id', p_sale_id);
END;
$$;

REVOKE ALL ON FUNCTION public.release_sale_credit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_sale_credit(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancel_invoice(
  p_sale_id UUID,
  p_reason  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_number     TEXT;
  v_is_cancelled    BOOLEAN;
  v_payment_status  TEXT;
  v_deleted_at      TIMESTAMPTZ;
  v_sra             NUMERIC;
BEGIN
  SELECT sale_number, is_cancelled, payment_status, deleted_at, COALESCE(sale_return_adjust, 0)
  INTO   v_sale_number, v_is_cancelled, v_payment_status, v_deleted_at, v_sra
  FROM   sales
  WHERE  id = p_sale_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF v_is_cancelled OR lower(coalesce(v_payment_status, '')) = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice is already cancelled');
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice has been deleted');
  END IF;

  -- Release the note before the return row is detached. The sync trigger
  -- rewrites used_amount only when the adjustment voucher is soft-deleted.
  IF v_sra > 0 THEN
    UPDATE voucher_entries
       SET deleted_at = NOW(),
           deleted_by = auth.uid()
     WHERE reference_id = p_sale_id
       AND deleted_at IS NULL
       AND payment_method = 'credit_note_adjustment';

    PERFORM public.restore_linked_returns_after_credit_release(p_sale_id);
  END IF;

  DELETE FROM sale_items WHERE sale_id = p_sale_id;

  UPDATE sales SET
    is_cancelled       = true,
    cancelled_at       = NOW(),
    cancelled_by       = auth.uid(),
    cancelled_reason   = p_reason,
    payment_status     = 'cancelled',
    sale_return_adjust = 0,
    updated_at         = NOW()
  WHERE id = p_sale_id;

  UPDATE voucher_entries
  SET    reference_type = 'cancelled_invoice',
         updated_at     = NOW()
  WHERE  reference_id  = p_sale_id
    AND  voucher_type  = 'receipt'
    AND  deleted_at IS NULL
    AND  COALESCE(payment_method, '') <> 'credit_note_adjustment';

  RETURN jsonb_build_object(
    'success',     true,
    'sale_number', v_sale_number,
    'message',     'Invoice ' || v_sale_number || ' cancelled. Stock and sale return credits restored.'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_sale(p_sale_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_org_id uuid;
  v_sale_number text;
  v_deleted_at timestamptz;
  v_sra numeric;
  v_remaining_qty integer;
  v_batch RECORD;
  v_product_type text;
  v_qty_restored integer := 0;
  v_lines integer := 0;
BEGIN
  SELECT organization_id, sale_number, deleted_at, COALESCE(sale_return_adjust, 0)
  INTO v_org_id, v_sale_number, v_deleted_at, v_sra
  FROM sales
  WHERE id = p_sale_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Sale not found'
    );
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_deleted', true,
      'sale_number', v_sale_number,
      'qty_restored', 0,
      'lines', 0
    );
  END IF;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Sale has no organization_id'
    );
  END IF;

  IF v_sra > 0 THEN
    UPDATE voucher_entries
       SET deleted_at = now(),
           deleted_by = p_user_id
     WHERE reference_id = p_sale_id
       AND deleted_at IS NULL
       AND payment_method = 'credit_note_adjustment';

    PERFORM public.restore_linked_returns_after_credit_release(p_sale_id);
  END IF;

  FOR v_item IN
    SELECT si.variant_id, si.quantity
    FROM sale_items si
    WHERE si.sale_id = p_sale_id
      AND si.deleted_at IS NULL
      AND si.variant_id IS NOT NULL
      AND COALESCE(si.quantity, 0) > 0
  LOOP
    SELECT p.product_type INTO v_product_type
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.id = v_item.variant_id
    LIMIT 1;

    IF v_product_type = 'service' THEN
      CONTINUE;
    END IF;

    UPDATE product_variants
    SET stock_qty = stock_qty + v_item.quantity,
        updated_at = now()
    WHERE id = v_item.variant_id
      AND organization_id = v_org_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Variant % not found in organization %', v_item.variant_id, v_org_id;
    END IF;

    v_remaining_qty := v_item.quantity;
    FOR v_batch IN
      SELECT id
      FROM batch_stock
      WHERE variant_id = v_item.variant_id
      ORDER BY purchase_date ASC
    LOOP
      EXIT WHEN v_remaining_qty <= 0;
      UPDATE batch_stock
      SET quantity = quantity + v_remaining_qty,
          updated_at = now()
      WHERE id = v_batch.id;
      v_remaining_qty := 0;
    END LOOP;

    INSERT INTO stock_movements (
      variant_id, movement_type, quantity, reference_id,
      organization_id, notes, bill_number, user_id
    )
    VALUES (
      v_item.variant_id,
      'soft_delete_sale',
      v_item.quantity,
      p_sale_id,
      v_org_id,
      'Stock returned - sale moved to recycle bin',
      v_sale_number,
      COALESCE(auth.uid(), p_user_id)
    );

    v_qty_restored := v_qty_restored + v_item.quantity;
    v_lines := v_lines + 1;
  END LOOP;

  UPDATE sale_items
  SET deleted_at = now(), deleted_by = p_user_id
  WHERE sale_id = p_sale_id
    AND deleted_at IS NULL;

  UPDATE voucher_entries
  SET deleted_at = now(), deleted_by = p_user_id
  WHERE reference_id = p_sale_id
    AND reference_type IN ('sale', 'invoice', 'SALE')
    AND deleted_at IS NULL;

  IF v_sale_number IS NOT NULL AND length(trim(v_sale_number)) > 0 THEN
    UPDATE voucher_entries
    SET deleted_at = now(), deleted_by = p_user_id
    WHERE organization_id = v_org_id
      AND description ILIKE '%' || v_sale_number || '%'
      AND voucher_type IN ('receipt', 'credit_note')
      AND deleted_at IS NULL;
  END IF;

  UPDATE sales
  SET deleted_at = now(), deleted_by = p_user_id
  WHERE id = p_sale_id
    AND deleted_at IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'already_deleted', false,
    'sale_number', v_sale_number,
    'qty_restored', v_qty_restored,
    'lines', v_lines
  );
END;
$function$;
