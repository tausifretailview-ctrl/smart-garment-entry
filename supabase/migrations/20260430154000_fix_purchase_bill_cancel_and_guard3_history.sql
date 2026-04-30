-- Fixes:
-- 1) soft_delete_purchase_bill Guard 3 uses purchase-bill history instead of timestamp delta
-- 2) cancel_purchase_bill also marks deleted_at/deleted_by for Recycle Bin visibility
-- 3) restore_purchase_bill restores both soft-deleted and cancelled bills

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

  -- Auto-delete product/variant only for bill-created unsold inventory.
  FOR v_item IN
    SELECT DISTINCT pi.sku_id, pv.product_id
    FROM purchase_items pi
    JOIN product_variants pv ON pv.id = pi.sku_id
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
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

    -- GUARD 3: variant was referenced in a purchase bill created before this bill.
    IF EXISTS (
      SELECT 1
      FROM purchase_items pi3
      JOIN purchase_bills pb3 ON pb3.id = pi3.bill_id
      WHERE pi3.sku_id = v_item.sku_id
        AND pi3.bill_id != p_bill_id
        AND pb3.created_at < (SELECT created_at FROM purchase_bills WHERE id = p_bill_id)
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

  UPDATE purchase_items
  SET deleted_at = now(), deleted_by = p_user_id
  WHERE bill_id = p_bill_id
    AND deleted_at IS NULL;

  UPDATE voucher_entries
  SET deleted_at = now(), deleted_by = p_user_id
  WHERE reference_id = p_bill_id
    AND deleted_at IS NULL;

  UPDATE purchase_bills
  SET deleted_at = now(), deleted_by = p_user_id
  WHERE id = p_bill_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_purchase_bill(p_bill_id uuid, p_reason text DEFAULT NULL::text)
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
  v_blocker       RECORD;
  v_blocked_list  TEXT := '';
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

  FOR v_blocker IN
    SELECT pi.sku_id,
           SUM(pi.qty)                        AS total_purchased,
           pv.stock_qty                       AS current_stock,
           COALESCE(bs.quantity, 0)           AS batch_qty,
           p.product_name                     AS product_name,
           pv.size                            AS size,
           pv.barcode                         AS barcode
      FROM purchase_items pi
      JOIN product_variants pv ON pv.id = pi.sku_id
      JOIN products p          ON p.id = pv.product_id
      LEFT JOIN batch_stock bs
        ON bs.variant_id = pi.sku_id
       AND bs.purchase_bill_id = p_bill_id
     WHERE pi.bill_id = p_bill_id
       AND pi.deleted_at IS NULL
       AND pi.sku_id IS NOT NULL
     GROUP BY pi.sku_id, pv.stock_qty, bs.quantity, p.product_name, pv.size, pv.barcode
  LOOP
    IF v_blocker.current_stock < v_blocker.total_purchased
       OR v_blocker.batch_qty < v_blocker.total_purchased THEN
      v_blocked_list := v_blocked_list
        || CASE WHEN v_blocked_list = '' THEN '' ELSE '; ' END
        || v_blocker.product_name
        || COALESCE(' (' || NULLIF(v_blocker.size, '') || ')', '')
        || COALESCE(' [' || NULLIF(v_blocker.barcode, '') || ']', '')
        || ' — purchased ' || v_blocker.total_purchased
        || ', available ' || LEAST(v_blocker.current_stock, v_blocker.batch_qty);
    END IF;
  END LOOP;

  IF v_blocked_list <> '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot cancel: some items have already been sold or returned. ' || v_blocked_list
    );
  END IF;

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
        (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
      VALUES
        (v_item.sku_id, 'purchase_delete', -v_item.qty, p_bill_id, v_org_id,
         'Stock reversed - purchase bill cancelled', v_item.bill_number, auth.uid());
    END IF;
  END LOOP;

  UPDATE purchase_items
     SET deleted_at = now(), deleted_by = auth.uid()
   WHERE bill_id = p_bill_id
     AND deleted_at IS NULL;

  UPDATE voucher_entries
     SET reference_type = 'cancelled_purchase_bill',
         updated_at = now()
   WHERE reference_id = p_bill_id
     AND voucher_type = 'payment'
     AND deleted_at IS NULL;

  UPDATE purchase_bills
     SET is_cancelled     = true,
         cancelled_at     = now(),
         cancelled_by     = auth.uid(),
         cancelled_reason = p_reason,
         deleted_at       = now(),
         deleted_by       = auth.uid(),
         updated_at       = now()
   WHERE id = p_bill_id;

  RETURN jsonb_build_object(
    'success', true,
    'bill_no', v_bill_no,
    'message', 'Purchase bill ' || v_bill_no || ' cancelled. Stock has been reversed.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

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
  SET deleted_at = NULL,
      deleted_by = NULL,
      is_cancelled = false,
      cancelled_at = NULL,
      cancelled_by = NULL,
      cancelled_reason = NULL
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
