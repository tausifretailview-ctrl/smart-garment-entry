-- Sale return ↔ invoice integrity: restore linked SRs when invoices are cancelled
-- or soft-deleted; audit view for drift.

-- 1. cancel_invoice — restore linked sale returns and clear sale_return_adjust
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
  v_sale_number  TEXT;
  v_is_cancelled BOOLEAN;
  v_deleted_at   TIMESTAMPTZ;
  v_sra          NUMERIC;
BEGIN
  SELECT sale_number, is_cancelled, deleted_at, COALESCE(sale_return_adjust, 0)
  INTO   v_sale_number, v_is_cancelled, v_deleted_at, v_sra
  FROM   sales
  WHERE  id = p_sale_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF v_is_cancelled THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice is already cancelled');
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice has been deleted');
  END IF;

  IF v_sra > 0 THEN
    UPDATE sale_returns
    SET    credit_status            = 'pending',
           linked_sale_id           = NULL,
           credit_available_balance = net_amount
    WHERE  linked_sale_id = p_sale_id
      AND  credit_status IN ('adjusted', 'partially_adjusted')
      AND  deleted_at IS NULL;
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
    AND  voucher_type  = 'receipt';

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


-- 2. soft_delete_sale — restore linked SRs before soft-delete
CREATE OR REPLACE FUNCTION public.soft_delete_sale(p_sale_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_org_id uuid;
  v_sale_number text;
  v_remaining_qty INTEGER;
  v_batch RECORD;
  v_sra NUMERIC;
BEGIN
  SELECT organization_id, sale_number, COALESCE(sale_return_adjust, 0)
  INTO v_org_id, v_sale_number, v_sra
  FROM sales WHERE id = p_sale_id;

  IF v_sra > 0 THEN
    UPDATE sale_returns
    SET    credit_status            = 'pending',
           linked_sale_id           = NULL,
           credit_available_balance = net_amount
    WHERE  linked_sale_id = p_sale_id
      AND  credit_status IN ('adjusted', 'partially_adjusted')
      AND  deleted_at IS NULL;
  END IF;

  FOR v_item IN SELECT si.variant_id, si.quantity
    FROM sale_items si WHERE si.sale_id = p_sale_id AND si.deleted_at IS NULL
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty + v_item.quantity,
        updated_at = now() WHERE id = v_item.variant_id;
      v_remaining_qty := v_item.quantity;
      FOR v_batch IN SELECT id FROM batch_stock
        WHERE variant_id = v_item.variant_id ORDER BY purchase_date ASC
      LOOP
        EXIT WHEN v_remaining_qty <= 0;
        UPDATE batch_stock SET quantity = quantity + v_remaining_qty,
          updated_at = now() WHERE id = v_batch.id;
        v_remaining_qty := 0;
      END LOOP;
      INSERT INTO stock_movements (variant_id, movement_type, quantity,
        reference_id, organization_id, notes, bill_number, user_id)
      VALUES (v_item.variant_id, 'soft_delete_sale', v_item.quantity,
        p_sale_id, v_org_id, 'Stock returned - sale moved to recycle bin',
        v_sale_number, auth.uid());
    END IF;
  END LOOP;

  UPDATE sale_items SET deleted_at = now(), deleted_by = p_user_id
    WHERE sale_id = p_sale_id;

  UPDATE voucher_entries SET deleted_at = now(), deleted_by = p_user_id
    WHERE reference_id = p_sale_id
      AND reference_type IN ('sale', 'invoice')
      AND deleted_at IS NULL;

  IF v_sale_number IS NOT NULL AND length(trim(v_sale_number)) > 0 THEN
    UPDATE voucher_entries SET deleted_at = now(), deleted_by = p_user_id
      WHERE organization_id = v_org_id
        AND description ILIKE '%' || v_sale_number || '%'
        AND voucher_type IN ('receipt', 'credit_note')
        AND deleted_at IS NULL;
  END IF;

  UPDATE sales SET deleted_at = now(), deleted_by = p_user_id
    WHERE id = p_sale_id;
END; $function$;


-- 3. Audit: SR net vs linked invoice sale_return_adjust (per-row drift)
CREATE OR REPLACE VIEW public.sr_invoice_integrity_check AS
SELECT
  sr.id                 AS sale_return_id,
  sr.return_number,
  sr.net_amount         AS sr_net_amount,
  sr.credit_status,
  sr.linked_sale_id,
  s.sale_number,
  s.sale_return_adjust  AS invoice_sra,
  sr.net_amount - COALESCE(s.sale_return_adjust, 0) AS drift_amount,
  sr.organization_id,
  sr.customer_id,
  sr.customer_name
FROM sale_returns sr
LEFT JOIN sales s ON s.id = sr.linked_sale_id AND s.deleted_at IS NULL
WHERE sr.credit_status = 'adjusted'
  AND sr.linked_sale_id IS NOT NULL
  AND sr.deleted_at IS NULL
  AND ABS(sr.net_amount - COALESCE(s.sale_return_adjust, 0)) > 0.50;

COMMENT ON VIEW public.sr_invoice_integrity_check IS
  'Flags sale_returns linked to an invoice where sr.net_amount does not match sales.sale_return_adjust. Non-zero drift_amount may indicate lost or over-applied credit.';
