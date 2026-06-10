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
  SELECT organization_id INTO v_org_id FROM purchase_bills WHERE id = p_bill_id;

  -- 1. Single-query negative-stock pre-check (aggregated per sku, in case the
  --    same variant appears on multiple lines of the same bill).
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
    RAISE EXCEPTION 'Cannot delete: stock would go negative for % (size %). Current: %, need to reverse: %. Delete the sales that consumed this stock first.',
      v_short.product_name, v_short.size, v_short.stock_qty, v_short.need;
  END IF;

  -- 2. Reverse product_variants.stock_qty in a single set-based UPDATE
  --    (aggregate qty per sku to handle duplicate SKUs on the same bill).
  WITH agg AS (
    SELECT sku_id, SUM(qty)::numeric AS qty
    FROM purchase_items
    WHERE bill_id = p_bill_id
      AND deleted_at IS NULL
      AND sku_id IS NOT NULL
    GROUP BY sku_id
  )
  UPDATE product_variants pv
  SET stock_qty = pv.stock_qty - agg.qty,
      updated_at = now()
  FROM agg
  WHERE pv.id = agg.sku_id;

  -- 3. Decrement batch_stock for this bill in one statement
  WITH agg AS (
    SELECT sku_id, SUM(qty)::numeric AS qty
    FROM purchase_items
    WHERE bill_id = p_bill_id
      AND deleted_at IS NULL
      AND sku_id IS NOT NULL
    GROUP BY sku_id
  )
  UPDATE batch_stock bs
  SET quantity = GREATEST(0, bs.quantity - agg.qty),
      updated_at = now()
  FROM agg
  WHERE bs.purchase_bill_id = p_bill_id
    AND bs.variant_id = agg.sku_id;

  -- 4. Drop zero-quantity batch_stock rows for this bill
  DELETE FROM batch_stock
  WHERE purchase_bill_id = p_bill_id
    AND quantity <= 0;

  -- 5. Audit rows in stock_movements (one INSERT … SELECT)
  INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
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

  -- 6. Soft-delete child rows + the bill itself
  UPDATE purchase_items
  SET deleted_at = now(), deleted_by = p_user_id
  WHERE bill_id = p_bill_id;

  UPDATE voucher_entries
  SET deleted_at = now(), deleted_by = p_user_id
  WHERE reference_id = p_bill_id AND deleted_at IS NULL;

  UPDATE purchase_bills
  SET deleted_at = now(), deleted_by = p_user_id
  WHERE id = p_bill_id;
END;
$function$;