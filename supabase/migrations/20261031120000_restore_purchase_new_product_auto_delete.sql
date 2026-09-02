-- Restore guarded product-master cleanup on purchase bill delete.
--
-- User rule:
--   * + Add New Product on this bill, no other history → soft-delete product master with the bill
--   * Existing catalog / earlier purchase / sale history → keep product master
--
-- Soft-delete only (Recycle Bin). restore_purchase_bill already undeletes those rows.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS created_in_purchase boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.created_in_purchase IS
  'True when the product master was created from Purchase Entry (+ Add New Product / price-tier fork), not Product Master. Bill delete may recycle it if it has no other history.';

CREATE OR REPLACE FUNCTION public._product_is_new_without_other_history(
  p_organization_id uuid,
  p_product_id uuid,
  p_bill_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    NOT EXISTS (
      SELECT 1
      FROM public.purchase_items pi
      WHERE pi.product_id = p_product_id
        AND pi.bill_id IS DISTINCT FROM p_bill_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.sale_items si
      WHERE si.product_id = p_product_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.sale_items si
      JOIN public.product_variants pv ON pv.id = si.variant_id
      WHERE pv.product_id = p_product_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.sale_return_items sri
      WHERE sri.product_id = p_product_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.purchase_return_items pri
      WHERE pri.product_id = p_product_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.purchase_order_items poi
      WHERE poi.product_id = p_product_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.quotation_items qi
      WHERE qi.product_id = p_product_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.sale_order_items soi
      WHERE soi.product_id = p_product_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.delivery_challan_items dci
      WHERE dci.product_id = p_product_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.product_variants pv
      WHERE pv.product_id = p_product_id
        AND COALESCE(pv.opening_qty, 0) > 0
    )
    AND (
      COALESCE((SELECT p.created_in_purchase FROM public.products p WHERE p.id = p_product_id), false)
      OR EXISTS (
        SELECT 1
        FROM public.products p
        JOIN public.purchase_bills pb ON pb.id = p_bill_id
        WHERE p.id = p_product_id
          AND p.organization_id = p_organization_id
          AND p.created_at >= pb.created_at - INTERVAL '2 hours'
      )
    );
$$;

COMMENT ON FUNCTION public._product_is_new_without_other_history(uuid, uuid, uuid) IS
  'True when this product master was born on p_bill_id: no other purchase/sale/order history, no opening stock, and either created_in_purchase or created within 2 hours of the bill.';

DROP FUNCTION IF EXISTS public.soft_delete_purchase_bill(uuid, uuid);

CREATE OR REPLACE FUNCTION public.soft_delete_purchase_bill(p_bill_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_org_id uuid;
  v_short RECORD;
  v_zero_stock_remaining integer := 0;
  v_auto_deleted integer := 0;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM purchase_bills
  WHERE id = p_bill_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Purchase bill not found' USING ERRCODE = 'P0002';
  END IF;

  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated'
         AND NOT (v_org_id IN (SELECT public.get_user_organization_ids(auth.uid())))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

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

  -- 5. Audit stock_movements (one INSERT … SELECT — one row per purchase line).
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

  -- 6. Soft-delete product master only when this bill is its only history.
  UPDATE product_variants pv
  SET deleted_at = now(),
      deleted_by = p_user_id,
      updated_at = now()
  WHERE pv.organization_id = v_org_id
    AND pv.deleted_at IS NULL
    AND pv.product_id IN (
      SELECT DISTINCT pi.product_id
      FROM purchase_items pi
      WHERE pi.bill_id = p_bill_id
        AND pi.deleted_at IS NULL
        AND pi.product_id IS NOT NULL
        AND public._product_is_new_without_other_history(v_org_id, pi.product_id, p_bill_id)
    );

  UPDATE products p
  SET deleted_at = now(),
      deleted_by = p_user_id,
      updated_at = now()
  WHERE p.organization_id = v_org_id
    AND p.deleted_at IS NULL
    AND p.id IN (
      SELECT DISTINCT pi.product_id
      FROM purchase_items pi
      WHERE pi.bill_id = p_bill_id
        AND pi.deleted_at IS NULL
        AND pi.product_id IS NOT NULL
        AND public._product_is_new_without_other_history(v_org_id, pi.product_id, p_bill_id)
    );

  GET DIAGNOSTICS v_auto_deleted = ROW_COUNT;

  -- 7. Remaining zero-stock *kept* masters (existing products with history).
  SELECT COUNT(*)::integer
    INTO v_zero_stock_remaining
  FROM (
    SELECT pv.product_id
    FROM purchase_items pi
    JOIN product_variants pv ON pv.id = pi.sku_id
    JOIN products p ON p.id = pv.product_id
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
      AND p.deleted_at IS NULL
      AND pv.deleted_at IS NULL
    GROUP BY pv.product_id
    HAVING COALESCE(SUM(pv.stock_qty), 0) = 0
  ) zero_kept;

  -- 8. Soft-delete child rows + linked vouchers + the bill header.
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

  RETURN jsonb_build_object(
    'auto_deleted_product_count', v_auto_deleted,
    'zero_stock_remaining_count', v_zero_stock_remaining
  );
END;
$function$;

COMMENT ON FUNCTION public.soft_delete_purchase_bill(uuid, uuid) IS
  'Reverses stock, soft-deletes the bill. Recycles product master only when the bill created it and it has no other history. Returns jsonb counts.';

REVOKE EXECUTE ON FUNCTION public._product_is_new_without_other_history(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._product_is_new_without_other_history(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public._product_is_new_without_other_history(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._product_is_new_without_other_history(uuid, uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.soft_delete_purchase_bill(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.soft_delete_purchase_bill(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_purchase_bill(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_purchase_bill(uuid, uuid) TO service_role;
