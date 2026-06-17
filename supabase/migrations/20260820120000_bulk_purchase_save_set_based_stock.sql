-- Large imported purchase bills (thousands of lines) timed out in
-- save_purchase_bill_with_items_atomic because:
--   1) per-item validation loop (N EXISTS on product_variants)
--   2) bulk INSERT still fired per-row triggers:
--      validate_purchase_item_active_row, update_stock_on_purchase,
--      update_variant_last_purchase, trg_update_purchase_bill_total_qty
--
-- Fix: set-based validation; transaction-local GUC app.bulk_purchase_insert skips
-- per-row INSERT triggers (session_replication_role is superuser-only on Supabase),
-- then apply stock / total_qty / last-purchase effects in aggregated SQL.

CREATE OR REPLACE FUNCTION public._apply_bulk_purchase_insert_effects(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_purchase_date timestamptz;
  v_bill_number text;
  v_org_id uuid;
  v_missing_variants integer;
BEGIN
  SELECT bill_date, software_bill_no, organization_id
  INTO v_purchase_date, v_bill_number, v_org_id
  FROM public.purchase_bills
  WHERE id = p_bill_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Purchase bill % not found for bulk insert effects', p_bill_id;
  END IF;

  UPDATE public.purchase_bills
  SET total_qty = (
    SELECT COALESCE(SUM(pi.qty), 0)::integer
    FROM public.purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
  )
  WHERE id = p_bill_id;

  WITH agg AS (
    SELECT pi.sku_id, SUM(pi.qty) AS qty
    FROM public.purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
    GROUP BY pi.sku_id
  )
  SELECT COUNT(*)::integer
  INTO v_missing_variants
  FROM agg
  WHERE NOT EXISTS (
    SELECT 1 FROM public.product_variants pv WHERE pv.id = agg.sku_id
  );

  IF v_missing_variants > 0 THEN
    RAISE EXCEPTION 'Cannot add purchase stock: % variant(s) not found', v_missing_variants;
  END IF;

  WITH agg AS (
    SELECT pi.sku_id, SUM(pi.qty) AS qty
    FROM public.purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
    GROUP BY pi.sku_id
  )
  UPDATE public.product_variants pv
  SET stock_qty = pv.stock_qty + agg.qty::integer,
      updated_at = NOW()
  FROM agg
  WHERE pv.id = agg.sku_id;

  WITH agg AS (
    SELECT pi.sku_id, SUM(pi.qty) AS qty
    FROM public.purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
    GROUP BY pi.sku_id
  )
  INSERT INTO public.batch_stock (
    variant_id,
    bill_number,
    quantity,
    purchase_bill_id,
    purchase_date,
    organization_id
  )
  SELECT
    agg.sku_id,
    v_bill_number,
    agg.qty::integer,
    p_bill_id,
    v_purchase_date,
    v_org_id
  FROM agg
  ON CONFLICT (variant_id, bill_number)
  DO UPDATE SET
    quantity = public.batch_stock.quantity + EXCLUDED.quantity,
    updated_at = NOW();

  INSERT INTO public.stock_movements (
    variant_id,
    movement_type,
    quantity,
    reference_id,
    bill_number,
    notes,
    organization_id,
    user_id
  )
  SELECT
    pi.sku_id,
    'purchase',
    pi.qty,
    p_bill_id,
    v_bill_number,
    'Stock added from purchase bill ' || v_bill_number,
    v_org_id,
    auth.uid()
  FROM public.purchase_items pi
  WHERE pi.bill_id = p_bill_id
    AND pi.deleted_at IS NULL
    AND pi.sku_id IS NOT NULL;

  -- Last row per sku_id wins (same as row-level AFTER INSERT trigger order).
  UPDATE public.product_variants pv
  SET
    last_purchase_pur_price = latest.pur_price,
    last_purchase_sale_price = latest.sale_price,
    last_purchase_mrp = latest.mrp,
    last_purchase_date = NOW(),
    updated_at = NOW()
  FROM (
    SELECT DISTINCT ON (pi.sku_id)
      pi.sku_id,
      pi.pur_price,
      pi.sale_price,
      pi.mrp
    FROM public.purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
    ORDER BY pi.sku_id, pi.ctid DESC
  ) AS latest
  WHERE pv.id = latest.sku_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_purchase_bill_with_items_atomic(
  p_organization_id uuid,
  p_bill jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_bill_no text;
  v_bill_id uuid;
  v_bad_line integer;
  v_bad_sku text;
  v_inserted_bill public.purchase_bills%ROWTYPE;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for organization %', p_organization_id;
  END IF;

  IF p_bill IS NULL OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_bill and p_items (array) are required';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one purchase line item is required';
  END IF;

  PERFORM set_config('statement_timeout', '300s', true);

  SELECT t.ordinality::integer
  INTO v_bad_line
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ordinality)
  WHERE COALESCE(t.value->>'sku_id', '') = ''
  ORDER BY t.ordinality
  LIMIT 1;

  IF v_bad_line IS NOT NULL THEN
    RAISE EXCEPTION 'Line %: sku_id is required', v_bad_line;
  END IF;

  SELECT t.ordinality::integer
  INTO v_bad_line
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ordinality)
  WHERE COALESCE((t.value->>'qty')::numeric, 0) <= 0
  ORDER BY t.ordinality
  LIMIT 1;

  IF v_bad_line IS NOT NULL THEN
    RAISE EXCEPTION 'Line %: qty must be greater than 0', v_bad_line;
  END IF;

  SELECT t.ordinality::integer
  INTO v_bad_line
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ordinality)
  WHERE COALESCE(t.value->>'product_id', '') = ''
  ORDER BY t.ordinality
  LIMIT 1;

  IF v_bad_line IS NOT NULL THEN
    RAISE EXCEPTION 'Line %: product_id is required', v_bad_line;
  END IF;

  SELECT t.ordinality::integer, t.value->>'sku_id'
  INTO v_bad_line, v_bad_sku
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ordinality)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.product_variants pv
    WHERE pv.id = (t.value->>'sku_id')::uuid
      AND pv.deleted_at IS NULL
      AND pv.organization_id = p_organization_id
  )
  ORDER BY t.ordinality
  LIMIT 1;

  IF v_bad_line IS NOT NULL THEN
    RAISE EXCEPTION 'Line %: variant % not found for organization', v_bad_line, v_bad_sku;
  END IF;

  v_bill_no := public.generate_purchase_bill_number_atomic(p_organization_id);

  INSERT INTO public.purchase_bills (
    software_bill_no,
    organization_id,
    supplier_id,
    supplier_name,
    supplier_invoice_no,
    supplier_inv_auto_generated,
    bill_date,
    bill_entry_at,
    gross_amount,
    discount_amount,
    gst_amount,
    other_charges,
    net_amount,
    round_off,
    is_dc_purchase
  )
  VALUES (
    v_bill_no,
    p_organization_id,
    NULLIF(p_bill->>'supplier_id', '')::uuid,
    COALESCE(p_bill->>'supplier_name', ''),
    NULLIF(p_bill->>'supplier_invoice_no', ''),
    COALESCE((p_bill->>'supplier_inv_auto_generated')::boolean, false),
    COALESCE((p_bill->>'bill_date')::date, CURRENT_DATE),
    COALESCE((p_bill->>'bill_entry_at')::timestamptz, NOW()),
    COALESCE((p_bill->>'gross_amount')::numeric, 0),
    COALESCE((p_bill->>'discount_amount')::numeric, 0),
    COALESCE((p_bill->>'gst_amount')::numeric, 0),
    COALESCE((p_bill->>'other_charges')::numeric, 0),
    COALESCE((p_bill->>'net_amount')::numeric, 0),
    COALESCE((p_bill->>'round_off')::numeric, 0),
    COALESCE((p_bill->>'is_dc_purchase')::boolean, false)
  )
  RETURNING * INTO v_inserted_bill;

  v_bill_id := v_inserted_bill.id;

  PERFORM set_config('app.bulk_purchase_insert', '1', true);

  INSERT INTO public.purchase_items (
      bill_id,
      product_id,
      sku_id,
      product_name,
      size,
      qty,
      pur_price,
      sale_price,
      mrp,
      gst_per,
      hsn_code,
      barcode,
      line_total,
      bill_number,
      brand,
      category,
      color,
      style,
      is_dc_item
    )
    SELECT
      v_bill_id,
      (item->>'product_id')::uuid,
      (item->>'sku_id')::uuid,
      item->>'product_name',
      COALESCE(item->>'size', ''),
      COALESCE((item->>'qty')::numeric, 0),
      COALESCE((item->>'pur_price')::numeric, 0),
      COALESCE((item->>'sale_price')::numeric, 0),
      COALESCE((item->>'mrp')::numeric, 0),
      COALESCE((item->>'gst_per')::numeric, 0),
      NULLIF(item->>'hsn_code', ''),
      NULLIF(item->>'barcode', ''),
      COALESCE((item->>'line_total')::numeric, 0),
      v_bill_no,
      NULLIF(item->>'brand', ''),
      NULLIF(item->>'category', ''),
      NULLIF(item->>'color', ''),
      NULLIF(item->>'style', ''),
      COALESCE((item->>'is_dc_item')::boolean, false)
    FROM jsonb_array_elements(p_items) AS item;

  PERFORM public._apply_bulk_purchase_insert_effects(v_bill_id);

  RETURN to_jsonb(v_inserted_bill);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_purchase_bill_with_items_atomic(uuid, jsonb, jsonb) TO authenticated;
