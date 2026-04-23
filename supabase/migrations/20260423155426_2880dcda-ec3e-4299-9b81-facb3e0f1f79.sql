-- Cascade CN/receipt vouchers (reference_type='customer') linked via sale_number in description
-- when soft-deleting or restoring a sale.

CREATE OR REPLACE FUNCTION public.soft_delete_sale(p_sale_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD; v_org_id uuid; v_sale_number text;
  v_remaining_qty INTEGER; v_batch RECORD;
BEGIN
  SELECT organization_id, sale_number INTO v_org_id, v_sale_number
  FROM sales WHERE id = p_sale_id;

  -- Stock restoration (existing logic)
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

  -- Soft-delete child records
  UPDATE sale_items SET deleted_at = now(), deleted_by = p_user_id
    WHERE sale_id = p_sale_id;

  -- Soft-delete vouchers directly referencing this sale
  UPDATE voucher_entries SET deleted_at = now(), deleted_by = p_user_id
    WHERE reference_id = p_sale_id
      AND reference_type IN ('sale', 'invoice')
      AND deleted_at IS NULL;

  -- Soft-delete CN-adjustment / receipt vouchers linked via description (reference_type='customer')
  IF v_sale_number IS NOT NULL AND length(trim(v_sale_number)) > 0 THEN
    UPDATE voucher_entries SET deleted_at = now(), deleted_by = p_user_id
      WHERE organization_id = v_org_id
        AND description ILIKE '%' || v_sale_number || '%'
        AND voucher_type IN ('receipt', 'credit_note')
        AND deleted_at IS NULL;
  END IF;

  -- Soft-delete the sale
  UPDATE sales SET deleted_at = now(), deleted_by = p_user_id
    WHERE id = p_sale_id;
END; $function$;


CREATE OR REPLACE FUNCTION public.restore_sale(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD; v_org_id uuid; v_sale_number text;
  v_remaining_qty INTEGER; v_batch RECORD; v_deduct_qty INTEGER;
BEGIN
  SELECT organization_id, sale_number INTO v_org_id, v_sale_number
    FROM sales WHERE id = p_sale_id;
  UPDATE sales SET deleted_at = NULL, deleted_by = NULL WHERE id = p_sale_id;

  FOR v_item IN SELECT si.variant_id, si.quantity
    FROM sale_items si WHERE si.sale_id = p_sale_id AND si.deleted_at IS NOT NULL
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty - v_item.quantity,
        updated_at = now() WHERE id = v_item.variant_id;
      v_remaining_qty := v_item.quantity;
      FOR v_batch IN SELECT id, quantity FROM batch_stock
        WHERE variant_id = v_item.variant_id AND quantity > 0
        ORDER BY purchase_date ASC
      LOOP
        EXIT WHEN v_remaining_qty <= 0;
        v_deduct_qty := LEAST(v_remaining_qty, v_batch.quantity);
        UPDATE batch_stock SET quantity = quantity - v_deduct_qty,
          updated_at = now() WHERE id = v_batch.id;
        v_remaining_qty := v_remaining_qty - v_deduct_qty;
      END LOOP;
      INSERT INTO stock_movements (variant_id, movement_type, quantity,
        reference_id, organization_id, notes, bill_number, user_id)
      VALUES (v_item.variant_id, 'restore_sale', -v_item.quantity,
        p_sale_id, v_org_id, 'Stock deducted - sale recovered',
        v_sale_number, auth.uid());
    END IF;
  END LOOP;

  UPDATE sale_items SET deleted_at = NULL, deleted_by = NULL
    WHERE sale_id = p_sale_id;

  -- Restore vouchers directly referencing this sale
  UPDATE voucher_entries SET deleted_at = NULL, deleted_by = NULL
    WHERE reference_id = p_sale_id
      AND reference_type IN ('sale', 'invoice');

  -- Restore CN-adjustment / receipt vouchers linked via description
  IF v_sale_number IS NOT NULL AND length(trim(v_sale_number)) > 0 THEN
    UPDATE voucher_entries SET deleted_at = NULL, deleted_by = NULL
      WHERE organization_id = v_org_id
        AND description ILIKE '%' || v_sale_number || '%'
        AND voucher_type IN ('receipt', 'credit_note');
  END IF;
END; $function$;