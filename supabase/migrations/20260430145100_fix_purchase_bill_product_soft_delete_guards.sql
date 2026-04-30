-- CRITICAL FIX:
-- Prevent accidental product/variant soft-deletes during purchase bill delete.
-- Product/variant is auto-deleted ONLY when all 3 guards pass:
-- 1) no other active purchase reference
-- 2) no sales history
-- 3) product was not pre-existing before this bill

CREATE OR REPLACE FUNCTION public.soft_delete_purchase_bill(p_bill_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item RECORD;
  v_org_id uuid;
  v_current_stock INTEGER;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM purchase_bills
  WHERE id = p_bill_id;

  -- Safety: block delete if reversing this bill would make stock negative.
  FOR v_item IN
    SELECT pi.sku_id, pi.qty, pi.bill_number, pi.product_name, pi.size
    FROM purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
  LOOP
    SELECT stock_qty INTO v_current_stock
    FROM product_variants
    WHERE id = v_item.sku_id;

    IF v_current_stock < v_item.qty THEN
      RAISE EXCEPTION
        'Cannot delete: stock would go negative for % (size %). Current: %, need to reverse: %. Delete the sales that consumed this stock first.',
        v_item.product_name, v_item.size, v_current_stock, v_item.qty;
    END IF;
  END LOOP;

  -- Reverse stock for all bill items.
  FOR v_item IN
    SELECT pi.sku_id, pi.qty, pi.bill_number
    FROM purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
  LOOP
    UPDATE product_variants
    SET stock_qty = stock_qty - v_item.qty,
        updated_at = now()
    WHERE id = v_item.sku_id;

    UPDATE batch_stock
    SET quantity = GREATEST(0, quantity - v_item.qty),
        updated_at = now()
    WHERE variant_id = v_item.sku_id
      AND purchase_bill_id = p_bill_id;

    DELETE FROM batch_stock
    WHERE variant_id = v_item.sku_id
      AND purchase_bill_id = p_bill_id
      AND quantity <= 0;

    INSERT INTO stock_movements (
      variant_id, movement_type, quantity, reference_id,
      organization_id, notes, bill_number, user_id
    )
    VALUES (
      v_item.sku_id, 'soft_delete_purchase', -v_item.qty, p_bill_id,
      v_org_id, 'Stock reversed - purchase bill moved to recycle bin', v_item.bill_number, auth.uid()
    );
  END LOOP;

  UPDATE purchase_items
  SET deleted_at = now(), deleted_by = p_user_id
  WHERE bill_id = p_bill_id;

  -- Auto-delete product/variant only for bill-created unsold inventory.
  FOR v_item IN
    SELECT DISTINCT pi.sku_id, pv.product_id
    FROM purchase_items pi
    JOIN product_variants pv ON pv.id = pi.sku_id
    WHERE pi.bill_id = p_bill_id
  LOOP
    -- GUARD 1: variant exists in any other active purchase bill.
    IF EXISTS (
      SELECT 1
      FROM purchase_items pi2
      WHERE pi2.sku_id = v_item.sku_id
        AND pi2.bill_id != p_bill_id
        AND pi2.deleted_at IS NULL
    ) THEN
      CONTINUE;
    END IF;

    -- GUARD 2: variant has sales history.
    IF EXISTS (
      SELECT 1
      FROM sale_items si
      WHERE si.sku_id = v_item.sku_id
        AND si.deleted_at IS NULL
    ) THEN
      CONTINUE;
    END IF;

    -- GUARD 3: product pre-existed this purchase bill.
    IF EXISTS (
      SELECT 1
      FROM products p
      JOIN purchase_bills pb ON pb.id = p_bill_id
      WHERE p.id = v_item.product_id
        AND p.created_at < pb.created_at - INTERVAL '1 minute'
    ) THEN
      CONTINUE;
    END IF;

    UPDATE product_variants
    SET deleted_at = now(), deleted_by = auth.uid()
    WHERE id = v_item.sku_id;

    IF NOT EXISTS (
      SELECT 1
      FROM product_variants
      WHERE product_id = v_item.product_id
        AND deleted_at IS NULL
    ) THEN
      UPDATE products
      SET deleted_at = now(), deleted_by = auth.uid()
      WHERE id = v_item.product_id;
    END IF;
  END LOOP;

  UPDATE voucher_entries
  SET deleted_at = now(), deleted_by = p_user_id
  WHERE reference_id = p_bill_id
    AND deleted_at IS NULL;

  UPDATE purchase_bills
  SET deleted_at = now(), deleted_by = p_user_id
  WHERE id = p_bill_id;
END;
$$;

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

  UPDATE purchase_bills
  SET deleted_at = NULL, deleted_by = NULL
  WHERE id = p_bill_id;

  FOR v_item IN
    SELECT pi.sku_id, pi.qty, pi.bill_number
    FROM purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NOT NULL
  LOOP
    IF v_item.sku_id IS NOT NULL THEN
      UPDATE product_variants
      SET stock_qty = stock_qty + v_item.qty,
          updated_at = now()
      WHERE id = v_item.sku_id;

      UPDATE batch_stock
      SET quantity = quantity + v_item.qty,
          updated_at = now()
      WHERE variant_id = v_item.sku_id
        AND purchase_bill_id = p_bill_id;

      INSERT INTO stock_movements (
        variant_id, movement_type, quantity, reference_id,
        organization_id, notes, bill_number, user_id
      )
      VALUES (
        v_item.sku_id, 'restore_purchase', v_item.qty, p_bill_id, v_org_id,
        'Stock restored - purchase bill recovered', v_item.bill_number, auth.uid()
      );
    END IF;
  END LOOP;

  UPDATE purchase_items
  SET deleted_at = NULL, deleted_by = NULL
  WHERE bill_id = p_bill_id;

  -- Restore variants/products that may have been auto-soft-deleted during bill delete.
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

  UPDATE voucher_entries
  SET deleted_at = NULL, deleted_by = NULL
  WHERE reference_id = p_bill_id;
END;
$$;
