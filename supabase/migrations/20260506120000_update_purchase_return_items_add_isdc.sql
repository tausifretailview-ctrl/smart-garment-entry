CREATE OR REPLACE FUNCTION public.update_purchase_return_items(
  p_return_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item jsonb;
  v_violations INTEGER;
BEGIN
  WITH current_returns AS (
    SELECT sku_id, SUM(qty) as returned_qty
    FROM purchase_return_items
    WHERE return_id = p_return_id AND deleted_at IS NULL
    GROUP BY sku_id
  ),
  new_requests AS (
    SELECT
      (item->>'sku_id')::uuid as sku_id,
      SUM((item->>'qty')::integer) as qty
    FROM jsonb_array_elements(p_items) as item
    GROUP BY (item->>'sku_id')::uuid
  ),
  stock_check AS (
    SELECT
      nr.sku_id, nr.qty as new_qty,
      COALESCE(cr.returned_qty, 0) as old_qty,
      pv.stock_qty,
      pv.stock_qty + COALESCE(cr.returned_qty, 0) as available_after_reverse
    FROM new_requests nr
    JOIN product_variants pv ON pv.id = nr.sku_id
    LEFT JOIN current_returns cr ON cr.sku_id = nr.sku_id
  )
  SELECT COUNT(*) INTO v_violations
  FROM stock_check WHERE available_after_reverse < new_qty;

  IF v_violations > 0 THEN
    RAISE EXCEPTION 'Insufficient stock for updated purchase return.';
  END IF;

  DELETE FROM purchase_return_items WHERE return_id = p_return_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO purchase_return_items (
      return_id, product_id, sku_id, size, color, qty,
      pur_price, gst_per, hsn_code, barcode, line_total,
      is_dc
    )
    VALUES (
      p_return_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'sku_id')::uuid,
      v_item->>'size',
      v_item->>'color',
      (v_item->>'qty')::integer,
      (v_item->>'pur_price')::numeric,
      (v_item->>'gst_per')::numeric,
      v_item->>'hsn_code',
      v_item->>'barcode',
      (v_item->>'line_total')::numeric,
      COALESCE((v_item->>'is_dc')::boolean, false)
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'item_count', jsonb_array_length(p_items));
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Purchase return update failed: %', SQLERRM;
END;
$$;
