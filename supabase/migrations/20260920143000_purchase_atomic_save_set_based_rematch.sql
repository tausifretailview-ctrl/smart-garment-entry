-- Purchase CREATE save: remove O(n) per-line plpgsql rematch + redundant trigger work
-- during atomic bulk insert. Line count (not per-line qty) drives statement cost.

CREATE OR REPLACE FUNCTION public.trg_purchase_item_match_existing_barcode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_org uuid;
  v_sku uuid;
  v_product uuid;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- save_purchase_bill_with_items_atomic rematches in one set-based pass and
  -- validates barcodes before commit; skip duplicate per-row resolve here.
  IF COALESCE(current_setting('app.bulk_purchase_insert', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  SELECT pb.organization_id
  INTO v_org
  FROM public.purchase_bills pb
  WHERE pb.id = NEW.bill_id;

  IF v_org IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT r.sku_id, r.product_id
  INTO v_sku, v_product
  FROM public.resolve_purchase_line_existing_barcode(
    v_org,
    NEW.sku_id,
    NEW.product_id,
    NEW.barcode,
    NEW.size,
    NEW.line_number
  ) r;

  IF v_sku IS NOT NULL THEN
    NEW.sku_id := v_sku;
    IF v_product IS NOT NULL THEN
      NEW.product_id := v_product;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_purchase_item_match_existing_barcode() IS
  'BEFORE INSERT/UPDATE backstop for legacy/non-bulk inserts. Skipped when app.bulk_purchase_insert=1 (atomic save already rematched).';

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
  v_expected_qty numeric;
  v_actual_movements numeric;
  v_bad_barcode text;
  v_bad_sku_barcode text;
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

  -- Set-based barcode rematch (one plan vs per-line LATERAL resolve_purchase_line_existing_barcode).
  WITH lines AS (
    SELECT
      t.ordinality,
      t.value,
      NULLIF(btrim(COALESCE(t.value->>'barcode', '')), '') AS line_bc,
      NULLIF(t.value->>'sku_id', '')::uuid AS line_sku_id,
      NULLIF(t.value->>'product_id', '')::uuid AS line_product_id,
      t.value->>'size' AS line_size
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ordinality)
  ),
  sku_meta AS (
    SELECT
      l.ordinality,
      l.value,
      l.line_bc,
      l.line_sku_id,
      l.line_product_id,
      l.line_size,
      pv.barcode AS sku_bc,
      pv.product_id AS sku_product_id
    FROM lines l
    JOIN public.product_variants pv
      ON pv.id = l.line_sku_id
     AND pv.organization_id = p_organization_id
     AND pv.deleted_at IS NULL
  ),
  needs_rematch AS (
    SELECT *
    FROM sku_meta
    WHERE line_bc IS NOT NULL
      AND COALESCE(btrim(sku_bc), '') IS DISTINCT FROM line_bc
  ),
  barcode_matches AS (
    SELECT DISTINCT ON (n.ordinality)
      n.ordinality,
      pv.id AS match_sku_id,
      pv.product_id AS match_product_id
    FROM needs_rematch n
    JOIN public.product_variants pv
      ON pv.organization_id = p_organization_id
     AND pv.deleted_at IS NULL
     AND pv.barcode = n.line_bc
    ORDER BY
      n.ordinality,
      CASE WHEN COALESCE(pv.size, '') = COALESCE(n.line_size, '') THEN 0 ELSE 1 END,
      pv.created_at ASC NULLS LAST,
      pv.id
  ),
  rematch_failed AS (
    SELECT n.ordinality, n.line_bc, n.line_sku_id, n.sku_bc
    FROM needs_rematch n
    WHERE NOT EXISTS (
      SELECT 1 FROM barcode_matches bm WHERE bm.ordinality = n.ordinality
    )
  )
  SELECT rf.ordinality, rf.line_bc, rf.line_sku_id::text, rf.sku_bc
  INTO v_bad_line, v_bad_barcode, v_bad_sku, v_bad_sku_barcode
  FROM rematch_failed rf
  ORDER BY rf.ordinality
  LIMIT 1;

  IF v_bad_line IS NOT NULL THEN
    RAISE EXCEPTION
      'Line %: purchase barcode % does not match stocked item % (barcode %) and no live item holds that barcode',
      v_bad_line,
      v_bad_barcode,
      v_bad_sku,
      COALESCE(btrim(v_bad_sku_barcode), '')
      USING ERRCODE = 'P0001';
  END IF;

  WITH lines AS (
    SELECT
      t.ordinality,
      t.value,
      NULLIF(btrim(COALESCE(t.value->>'barcode', '')), '') AS line_bc,
      NULLIF(t.value->>'sku_id', '')::uuid AS line_sku_id,
      NULLIF(t.value->>'product_id', '')::uuid AS line_product_id,
      t.value->>'size' AS line_size
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ordinality)
  ),
  sku_meta AS (
    SELECT
      l.ordinality,
      l.value,
      l.line_sku_id,
      l.line_product_id,
      l.line_size,
      l.line_bc,
      pv.barcode AS sku_bc,
      pv.product_id AS sku_product_id
    FROM lines l
    JOIN public.product_variants pv
      ON pv.id = l.line_sku_id
     AND pv.organization_id = p_organization_id
     AND pv.deleted_at IS NULL
  ),
  needs_rematch AS (
    SELECT sm.ordinality, sm.line_size, sm.line_bc
    FROM sku_meta sm
    WHERE sm.line_bc IS NOT NULL
      AND COALESCE(btrim(sm.sku_bc), '') IS DISTINCT FROM sm.line_bc
  ),
  barcode_matches AS (
    SELECT DISTINCT ON (n.ordinality)
      n.ordinality,
      pv.id AS match_sku_id,
      pv.product_id AS match_product_id
    FROM needs_rematch n
    JOIN public.product_variants pv
      ON pv.organization_id = p_organization_id
     AND pv.deleted_at IS NULL
     AND pv.barcode = n.line_bc
    ORDER BY
      n.ordinality,
      CASE WHEN COALESCE(pv.size, '') = COALESCE(n.line_size, '') THEN 0 ELSE 1 END,
      pv.created_at ASC NULLS LAST,
      pv.id
  )
  SELECT COALESCE(
    jsonb_agg(
      sm.value || jsonb_build_object(
        'sku_id', COALESCE(bm.match_sku_id, sm.line_sku_id),
        'product_id', COALESCE(bm.match_product_id, sm.sku_product_id, sm.line_product_id)
      )
      ORDER BY sm.ordinality
    ),
    '[]'::jsonb
  )
  INTO p_items
  FROM sku_meta sm
  LEFT JOIN barcode_matches bm ON bm.ordinality = sm.ordinality;

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
    is_dc_purchase,
    created_by
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
    COALESCE((p_bill->>'is_dc_purchase')::boolean, false),
    auth.uid()
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
    is_dc_item,
    line_number
  )
  SELECT
    v_bill_id,
    (item.value->>'product_id')::uuid,
    (item.value->>'sku_id')::uuid,
    item.value->>'product_name',
    COALESCE(item.value->>'size', ''),
    COALESCE((item.value->>'qty')::numeric, 0),
    COALESCE((item.value->>'pur_price')::numeric, 0),
    COALESCE((item.value->>'sale_price')::numeric, 0),
    COALESCE((item.value->>'mrp')::numeric, 0),
    COALESCE((item.value->>'gst_per')::numeric, 0),
    NULLIF(item.value->>'hsn_code', ''),
    NULLIF(item.value->>'barcode', ''),
    COALESCE((item.value->>'line_total')::numeric, 0),
    v_bill_no,
    NULLIF(item.value->>'brand', ''),
    NULLIF(item.value->>'category', ''),
    NULLIF(item.value->>'color', ''),
    NULLIF(item.value->>'style', ''),
    COALESCE((item.value->>'is_dc_item')::boolean, false),
    item.ordinality::integer
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS item(value, ordinality);

  PERFORM public._apply_bulk_purchase_insert_effects(v_bill_id);

  PERFORM set_config('app.bulk_purchase_insert', '', true);

  SELECT COALESCE(SUM(pi.qty), 0) INTO v_expected_qty
  FROM public.purchase_items pi
  WHERE pi.bill_id = v_bill_id
    AND pi.deleted_at IS NULL
    AND pi.sku_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      WHERE pv.id = pi.sku_id
        AND p.product_type = 'service'
    );

  SELECT COALESCE(SUM(sm.quantity), 0) INTO v_actual_movements
  FROM public.stock_movements sm
  WHERE sm.reference_id = v_bill_id
    AND sm.movement_type = 'purchase';

  IF v_actual_movements <> v_expected_qty THEN
    RAISE EXCEPTION
      'Purchase save guardrail failed: bill % expected stock movements totalling %, found %. Refusing to save bill with missing stock updates.',
      v_bill_id, v_expected_qty, v_actual_movements
      USING ERRCODE = 'P0001';
  END IF;

  SELECT pi.line_number, pi.barcode, pv.barcode
  INTO v_bad_line, v_bad_barcode, v_bad_sku_barcode
  FROM public.purchase_items pi
  JOIN public.product_variants pv ON pv.id = pi.sku_id
  WHERE pi.bill_id = v_bill_id
    AND pi.deleted_at IS NULL
    AND NULLIF(btrim(COALESCE(pi.barcode, '')), '') IS NOT NULL
    AND COALESCE(btrim(pv.barcode), '') IS DISTINCT FROM btrim(pi.barcode)
  ORDER BY pi.line_number
  LIMIT 1;

  IF v_bad_line IS NOT NULL THEN
    RAISE EXCEPTION
      'Purchase save guardrail failed: line % barcode % differs from stocked item barcode %',
      v_bad_line, v_bad_barcode, v_bad_sku_barcode
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_inserted_bill FROM public.purchase_bills WHERE id = v_bill_id;

  RETURN to_jsonb(v_inserted_bill);
END;
$$;

COMMENT ON FUNCTION public.save_purchase_bill_with_items_atomic(uuid, jsonb, jsonb) IS
  'Atomic purchase bill save. Set-based barcode rematch, bulk stock effects, guardrails. Trigger rematch skipped during bulk insert.';

GRANT EXECUTE ON FUNCTION public.save_purchase_bill_with_items_atomic(uuid, jsonb, jsonb) TO authenticated, service_role;
