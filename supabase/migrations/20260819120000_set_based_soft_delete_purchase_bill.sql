-- Large imported purchase bills (thousands of lines) timed out in soft_delete_purchase_bill /
-- restore_purchase_bill because stock reversal used per-item loops (N UPDATEs per bill).
-- Replace with set-based aggregation on product_variants.stock_qty (authoritative stock)
-- while preserving negative-stock guard, batch_stock, stock_movements audit, product guards,
-- voucher soft-delete, and restore semantics.

CREATE OR REPLACE FUNCTION public.soft_delete_purchase_bill(p_bill_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_short RECORD;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM purchase_bills
  WHERE id = p_bill_id;

  -- 1. Aggregated negative-stock pre-check (per sku_id — same variant may appear on multiple lines).
  SELECT pi.product_name, pi.size, pv.stock_qty, SUM(pi.qty) AS need
    INTO v_short
  FROM purchase_items pi
  JOIN product_variants pv ON pv.id = pi.sku_id
  WHERE pi.bill_id = p_bill_id
    AND pi.deleted_at IS NULL
    AND pi.sku_id IS NOT NULL
  GROUP BY pi.sku_id, pi.product_name, pi.size, pv.stock_qty
  HAVING pv.stock_qty < SUM(pi.qty)
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Cannot delete: stock would go negative for % (size %). Current: %, need to reverse: %. Delete the sales that consumed this stock first.',
      v_short.product_name, v_short.size, v_short.stock_qty, v_short.need;
  END IF;

  -- 2. Reverse product_variants.stock_qty in one set-based UPDATE (aggregate qty per sku).
  WITH agg AS (
    SELECT sku_id, SUM(qty) AS qty
    FROM purchase_items
    WHERE bill_id = p_bill_id
      AND deleted_at IS NULL
      AND sku_id IS NOT NULL
    GROUP BY sku_id
  )
  UPDATE product_variants pv
  SET stock_qty = pv.stock_qty - agg.qty::integer,
      updated_at = now()
  FROM agg
  WHERE pv.id = agg.sku_id;

  -- 3. Decrement batch_stock for this bill in one statement.
  WITH agg AS (
    SELECT sku_id, SUM(qty) AS qty
    FROM purchase_items
    WHERE bill_id = p_bill_id
      AND deleted_at IS NULL
      AND sku_id IS NOT NULL
    GROUP BY sku_id
  )
  UPDATE batch_stock bs
  SET quantity = GREATEST(0, bs.quantity - agg.qty::integer),
      updated_at = now()
  FROM agg
  WHERE bs.purchase_bill_id = p_bill_id
    AND bs.variant_id = agg.sku_id;

  -- 4. Drop zero-quantity batch_stock rows for this bill.
  DELETE FROM batch_stock
  WHERE purchase_bill_id = p_bill_id
    AND quantity <= 0;

  -- 5. Audit stock_movements (one INSERT … SELECT — one row per purchase line, same as loop).
  INSERT INTO stock_movements (
    variant_id, movement_type, quantity, reference_id,
    organization_id, notes, bill_number, user_id
  )
  SELECT pi.sku_id,
         'soft_delete_purchase',
         -pi.qty,
         p_bill_id,
         v_org_id,
         'Stock reversed - purchase bill moved to recycle bin',
         pi.bill_number,
         auth.uid()
  FROM purchase_items pi
  WHERE pi.bill_id = p_bill_id
    AND pi.deleted_at IS NULL
    AND pi.sku_id IS NOT NULL;

  -- 6. Auto-delete product/variant only for bill-created unsold inventory (set-based guards).
  WITH bill_skus AS (
    SELECT DISTINCT pi.sku_id, pv.product_id
    FROM purchase_items pi
    JOIN product_variants pv ON pv.id = pi.sku_id
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
  ),
  eligible_variants AS (
    SELECT bs.sku_id, bs.product_id
    FROM bill_skus bs
    WHERE NOT EXISTS (
      SELECT 1
      FROM purchase_items pi2
      WHERE pi2.sku_id = bs.sku_id
        AND pi2.bill_id != p_bill_id
        AND pi2.deleted_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM sale_items si
      WHERE si.sku_id = bs.sku_id
        AND si.deleted_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM purchase_items pi3
      JOIN purchase_bills pb3 ON pb3.id = pi3.bill_id
      WHERE pi3.sku_id = bs.sku_id
        AND pi3.bill_id != p_bill_id
        AND pb3.created_at < (SELECT created_at FROM purchase_bills WHERE id = p_bill_id)
    )
  )
  UPDATE product_variants pv
  SET deleted_at = now(),
      deleted_by = auth.uid()
  FROM eligible_variants ev
  WHERE pv.id = ev.sku_id;

  UPDATE products p
  SET deleted_at = now(),
      deleted_by = auth.uid()
  WHERE p.deleted_at IS NULL
    AND p.id IN (
      SELECT DISTINCT pv.product_id
      FROM purchase_items pi
      JOIN product_variants pv ON pv.id = pi.sku_id
      WHERE pi.bill_id = p_bill_id
        AND pi.deleted_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM product_variants pv
      WHERE pv.product_id = p.id
        AND pv.deleted_at IS NULL
    );

  -- 7. Soft-delete child rows + linked vouchers + the bill header.
  UPDATE purchase_items
  SET deleted_at = now(),
      deleted_by = p_user_id
  WHERE bill_id = p_bill_id
    AND deleted_at IS NULL;

  UPDATE voucher_entries
  SET deleted_at = now(),
      deleted_by = p_user_id
  WHERE reference_id = p_bill_id
    AND deleted_at IS NULL;

  UPDATE purchase_bills
  SET deleted_at = now(),
      deleted_by = p_user_id
  WHERE id = p_bill_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_purchase_bill(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_bill_number text;
  v_purchase_date timestamptz;
BEGIN
  SELECT organization_id,
         COALESCE(software_bill_no, supplier_invoice_no, id::text),
         COALESCE(bill_entry_at, created_at, now())
    INTO v_org_id, v_bill_number, v_purchase_date
  FROM purchase_bills
  WHERE id = p_bill_id;

  -- Reset both soft-delete and cancellation flags.
  UPDATE purchase_bills
  SET deleted_at       = NULL,
      deleted_by       = NULL,
      is_cancelled     = false,
      cancelled_at     = NULL,
      cancelled_by     = NULL,
      cancelled_reason = NULL,
      updated_at       = now()
  WHERE id = p_bill_id;

  -- Re-apply product_variants.stock_qty in one set-based UPDATE (aggregate per sku).
  WITH agg AS (
    SELECT sku_id, SUM(qty) AS qty
    FROM purchase_items
    WHERE bill_id = p_bill_id
      AND deleted_at IS NOT NULL
      AND sku_id IS NOT NULL
    GROUP BY sku_id
  )
  UPDATE product_variants pv
  SET stock_qty = pv.stock_qty + agg.qty::integer,
      updated_at = now()
  FROM agg
  WHERE pv.id = agg.sku_id;

  -- Restore batch_stock: bump existing rows, insert missing rows (no double-count).
  WITH agg AS (
    SELECT sku_id, SUM(qty) AS qty
    FROM purchase_items
    WHERE bill_id = p_bill_id
      AND deleted_at IS NOT NULL
      AND sku_id IS NOT NULL
    GROUP BY sku_id
  )
  UPDATE batch_stock bs
  SET quantity = bs.quantity + agg.qty::integer,
      updated_at = now()
  FROM agg
  WHERE bs.variant_id = agg.sku_id
    AND bs.purchase_bill_id = p_bill_id;

  WITH agg AS (
    SELECT sku_id, SUM(qty) AS qty
    FROM purchase_items
    WHERE bill_id = p_bill_id
      AND deleted_at IS NOT NULL
      AND sku_id IS NOT NULL
    GROUP BY sku_id
  )
  INSERT INTO batch_stock (
    variant_id,
    purchase_bill_id,
    quantity,
    organization_id,
    bill_number,
    purchase_date,
    created_at,
    updated_at
  )
  SELECT a.sku_id,
         p_bill_id,
         a.qty::integer,
         v_org_id,
         v_bill_number,
         v_purchase_date,
         now(),
         now()
  FROM agg a
  WHERE NOT EXISTS (
    SELECT 1
    FROM batch_stock bs
    WHERE bs.variant_id = a.sku_id
      AND bs.purchase_bill_id = p_bill_id
  );

  -- Audit stock_movements (one row per purchase line — same as prior loop).
  INSERT INTO stock_movements (
    variant_id, movement_type, quantity, reference_id,
    organization_id, notes, bill_number, user_id
  )
  SELECT pi.sku_id,
         'restore_purchase',
         pi.qty,
         p_bill_id,
         v_org_id,
         'Stock restored - purchase bill recovered',
         pi.bill_number,
         auth.uid()
  FROM purchase_items pi
  WHERE pi.bill_id = p_bill_id
    AND pi.deleted_at IS NOT NULL
    AND pi.sku_id IS NOT NULL;

  -- Restore purchase_items.
  UPDATE purchase_items
  SET deleted_at = NULL,
      deleted_by = NULL
  WHERE bill_id = p_bill_id;

  -- Restore variants/products that were auto soft-deleted during bill delete.
  UPDATE product_variants pv
  SET deleted_at = NULL,
      deleted_by = NULL
  WHERE pv.id IN (
    SELECT DISTINCT pi.sku_id
    FROM purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.sku_id IS NOT NULL
  )
  AND pv.deleted_at IS NOT NULL;

  UPDATE products p
  SET deleted_at = NULL,
      deleted_by = NULL
  WHERE p.id IN (
    SELECT DISTINCT pv.product_id
    FROM purchase_items pi
    JOIN product_variants pv ON pv.id = pi.sku_id
    WHERE pi.bill_id = p_bill_id
  )
  AND p.deleted_at IS NOT NULL;

  -- Restore voucher entries: revert reference_type set by cancel, clear soft-delete.
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
$function$;

GRANT EXECUTE ON FUNCTION public.soft_delete_purchase_bill(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_purchase_bill(uuid) TO authenticated;
