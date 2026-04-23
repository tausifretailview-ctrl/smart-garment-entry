-- Add cancellation columns to purchase_bills
ALTER TABLE public.purchase_bills
  ADD COLUMN IF NOT EXISTS is_cancelled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_reason text;

CREATE INDEX IF NOT EXISTS idx_purchase_bills_is_cancelled
  ON public.purchase_bills (organization_id, is_cancelled)
  WHERE deleted_at IS NULL;

-- RPC to cancel a purchase bill: reverses stock for each item, marks bill cancelled,
-- and removes batch_stock & linked voucher entries. The bill remains visible in the
-- dashboard with a CANCELLED tag (similar to cancel_invoice for sales).
CREATE OR REPLACE FUNCTION public.cancel_purchase_bill(
  p_bill_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bill_no       TEXT;
  v_is_cancelled  BOOLEAN;
  v_deleted_at    TIMESTAMPTZ;
  v_org_id        UUID;
  v_item          RECORD;
BEGIN
  SELECT COALESCE(software_bill_no, supplier_invoice_no, id::text),
         is_cancelled,
         deleted_at,
         organization_id
    INTO v_bill_no, v_is_cancelled, v_deleted_at, v_org_id
    FROM purchase_bills
   WHERE id = p_bill_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Purchase bill not found');
  END IF;

  IF v_is_cancelled THEN
    RETURN jsonb_build_object('success', false, 'error', 'Purchase bill is already cancelled');
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Purchase bill has been deleted');
  END IF;

  -- Reverse stock for each purchase item
  FOR v_item IN
    SELECT pi.sku_id, pi.qty, pi.bill_number
      FROM purchase_items pi
     WHERE pi.bill_id = p_bill_id
       AND pi.deleted_at IS NULL
  LOOP
    IF v_item.sku_id IS NOT NULL THEN
      UPDATE product_variants
         SET stock_qty = stock_qty - v_item.qty,
             updated_at = now()
       WHERE id = v_item.sku_id;

      UPDATE batch_stock
         SET quantity = quantity - v_item.qty,
             updated_at = now()
       WHERE variant_id = v_item.sku_id
         AND purchase_bill_id = p_bill_id;

      INSERT INTO stock_movements
        (variant_id, movement_type, quantity, reference_id, organization_id,
         notes, bill_number, user_id)
      VALUES
        (v_item.sku_id, 'cancel_purchase', -v_item.qty, p_bill_id, v_org_id,
         'Stock reversed - purchase bill cancelled', v_item.bill_number, auth.uid());
    END IF;
  END LOOP;

  -- Soft-remove items so they don't reappear in stock or reports
  UPDATE purchase_items
     SET deleted_at = now(),
         deleted_by = auth.uid()
   WHERE bill_id = p_bill_id
     AND deleted_at IS NULL;

  -- Nullify linked supplier payment vouchers (mark as cancelled bill reference)
  UPDATE voucher_entries
     SET reference_type = 'cancelled_purchase_bill',
         updated_at = now()
   WHERE reference_id = p_bill_id
     AND voucher_type = 'payment'
     AND deleted_at IS NULL;

  -- Mark the bill as cancelled (kept in DB, visible with CANCELLED tag)
  UPDATE purchase_bills
     SET is_cancelled     = true,
         cancelled_at     = now(),
         cancelled_by     = auth.uid(),
         cancelled_reason = p_reason,
         updated_at       = now()
   WHERE id = p_bill_id;

  RETURN jsonb_build_object(
    'success', true,
    'bill_no', v_bill_no,
    'message', 'Purchase bill ' || v_bill_no || ' cancelled. Stock has been reversed.'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;