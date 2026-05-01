-- Fix restore_purchase_bill so it fully restores both soft-deleted AND cancelled purchase bills.
-- Previous live version did not reset is_cancelled / cancelled_* fields nor revert
-- voucher_entries.reference_type from 'cancelled_purchase_bill' back to 'purchase_bill'.

CREATE OR REPLACE FUNCTION public.restore_purchase_bill(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item RECORD;
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM purchase_bills
  WHERE id = p_bill_id;

  -- Reset both soft-delete and cancellation flags
  UPDATE purchase_bills
  SET deleted_at       = NULL,
      deleted_by       = NULL,
      is_cancelled     = false,
      cancelled_at     = NULL,
      cancelled_by     = NULL,
      cancelled_reason = NULL,
      updated_at       = now()
  WHERE id = p_bill_id;

  -- Re-apply stock for every soft-deleted purchase item on this bill
  FOR v_item IN
    SELECT pi.sku_id, pi.qty, pi.bill_number
    FROM purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NOT NULL
      AND pi.sku_id IS NOT NULL
  LOOP
    UPDATE product_variants
    SET stock_qty = stock_qty + v_item.qty,
        updated_at = now()
    WHERE id = v_item.sku_id;

    -- Re-create batch_stock row if it was removed during cancel/delete
    INSERT INTO batch_stock (variant_id, purchase_bill_id, quantity, organization_id, created_at, updated_at)
    SELECT v_item.sku_id, p_bill_id, v_item.qty, v_org_id, now(), now()
    WHERE NOT EXISTS (
      SELECT 1 FROM batch_stock
      WHERE variant_id = v_item.sku_id AND purchase_bill_id = p_bill_id
    );

    UPDATE batch_stock
    SET quantity = quantity + v_item.qty,
        updated_at = now()
    WHERE variant_id = v_item.sku_id
      AND purchase_bill_id = p_bill_id
      AND NOT EXISTS (
        SELECT 1 FROM batch_stock bs2
        WHERE bs2.variant_id = v_item.sku_id
          AND bs2.purchase_bill_id = p_bill_id
          AND bs2.created_at = now()
      );

    INSERT INTO stock_movements (
      variant_id, movement_type, quantity, reference_id,
      organization_id, notes, bill_number, user_id
    )
    VALUES (
      v_item.sku_id, 'restore_purchase', v_item.qty, p_bill_id, v_org_id,
      'Stock restored - purchase bill recovered', v_item.bill_number, auth.uid()
    );
  END LOOP;

  -- Restore purchase_items
  UPDATE purchase_items
  SET deleted_at = NULL, deleted_by = NULL
  WHERE bill_id = p_bill_id;

  -- Restore variants/products that were auto soft-deleted during bill delete
  FOR v_item IN
    SELECT DISTINCT pi.sku_id, pv.product_id
    FROM purchase_items pi
    JOIN product_variants pv ON pv.id = pi.sku_id
    WHERE pi.bill_id = p_bill_id
  LOOP
    UPDATE product_variants
    SET deleted_at = NULL, deleted_by = NULL
    WHERE id = v_item.sku_id
      AND deleted_at IS NOT NULL;

    UPDATE products
    SET deleted_at = NULL, deleted_by = NULL
    WHERE id = v_item.product_id
      AND deleted_at IS NOT NULL;
  END LOOP;

  -- Restore voucher entries: revert reference_type set by cancel, clear soft-delete
  UPDATE voucher_entries
  SET deleted_at     = NULL,
      deleted_by     = NULL,
      reference_type = CASE
        WHEN reference_type = 'cancelled_purchase_bill' THEN 'purchase_bill'
        ELSE reference_type
      END,
      updated_at     = now()
  WHERE reference_id = p_bill_id;
END;
$$;