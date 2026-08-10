CREATE OR REPLACE FUNCTION public.bulk_update_purchase_items(p_bill_id uuid, p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_count integer := 0;
BEGIN
  IF p_bill_id IS NULL THEN
    RAISE EXCEPTION 'Bill id is required';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.purchase_bills
  WHERE id = p_bill_id AND deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Purchase bill not found';
  END IF;

  PERFORM public.assert_org_member(v_org);

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN 0;
  END IF;

  -- Suppress the per-row bill-total recompute (O(n^2) on large bills);
  -- totals are recomputed once below. Row-level stock triggers still fire.
  PERFORM set_config('app.bulk_purchase_insert', '1', true);

  UPDATE public.purchase_items pi
  SET product_name = s.product_name,
      sku_id       = s.sku_id,
      size         = s.size,
      qty          = s.qty,
      pur_price    = s.pur_price,
      sale_price   = s.sale_price,
      mrp          = COALESCE(s.mrp, 0),
      gst_per      = COALESCE(s.gst_per, 0),
      line_total   = s.line_total,
      hsn_code     = s.hsn_code,
      brand        = s.brand,
      category     = s.category,
      color        = s.color,
      style        = s.style
  FROM jsonb_to_recordset(p_items) AS s(
    id uuid,
    product_name text,
    sku_id uuid,
    size text,
    qty numeric,
    pur_price numeric,
    sale_price numeric,
    mrp numeric,
    gst_per integer,
    line_total numeric,
    hsn_code text,
    brand text,
    category text,
    color text,
    style text
  )
  WHERE pi.id = s.id
    AND pi.bill_id = p_bill_id
    AND pi.deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM set_config('app.bulk_purchase_insert', '', true);

  UPDATE public.purchase_bills pb
  SET total_items = agg.item_count,
      total_qty   = agg.qty_sum
  FROM (
    SELECT COUNT(*)::integer AS item_count,
           COALESCE(SUM(qty), 0) AS qty_sum
    FROM public.purchase_items
    WHERE bill_id = p_bill_id
      AND deleted_at IS NULL
  ) agg
  WHERE pb.id = p_bill_id;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.bulk_update_purchase_items(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_purchase_items(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_purchase_items(uuid, jsonb) TO service_role;