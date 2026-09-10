-- Purchase save: if a line already carries barcode X, stock the live item that
-- holds X. Never silently persist a line barcode that differs from the SKU
-- that received stock. Does NOT backfill existing purchase_items rows.

CREATE OR REPLACE FUNCTION public.resolve_purchase_line_existing_barcode(
  p_organization_id uuid,
  p_sku_id uuid,
  p_product_id uuid,
  p_barcode text,
  p_size text DEFAULT NULL,
  p_line_number integer DEFAULT NULL
)
RETURNS TABLE(sku_id uuid, product_id uuid, rematched boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_line_bc text := NULLIF(btrim(COALESCE(p_barcode, '')), '');
  v_sku_bc text;
  v_sku_product uuid;
  v_match_id uuid;
  v_match_product uuid;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated'
         AND NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  IF p_sku_id IS NULL THEN
    sku_id := NULL;
    product_id := p_product_id;
    rematched := false;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT pv.barcode, pv.product_id
  INTO v_sku_bc, v_sku_product
  FROM public.product_variants pv
  WHERE pv.id = p_sku_id
    AND pv.organization_id = p_organization_id
    AND pv.deleted_at IS NULL;

  IF v_line_bc IS NULL THEN
    sku_id := p_sku_id;
    product_id := COALESCE(v_sku_product, p_product_id);
    rematched := false;
    RETURN NEXT;
    RETURN;
  END IF;

  IF COALESCE(btrim(v_sku_bc), '') = v_line_bc THEN
    sku_id := p_sku_id;
    product_id := COALESCE(v_sku_product, p_product_id);
    rematched := false;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT pv.id, pv.product_id
  INTO v_match_id, v_match_product
  FROM public.product_variants pv
  WHERE pv.organization_id = p_organization_id
    AND pv.deleted_at IS NULL
    AND pv.barcode = v_line_bc
  ORDER BY
    CASE WHEN COALESCE(pv.size, '') = COALESCE(p_size, '') THEN 0 ELSE 1 END,
    pv.created_at ASC NULLS LAST,
    pv.id
  LIMIT 1;

  IF v_match_id IS NULL THEN
    RAISE EXCEPTION
      'Line %: purchase barcode % does not match stocked item % (barcode %) and no live item holds that barcode',
      COALESCE(p_line_number, 0),
      v_line_bc,
      p_sku_id,
      COALESCE(btrim(v_sku_bc), '')
      USING ERRCODE = 'P0001';
  END IF;

  sku_id := v_match_id;
  product_id := v_match_product;
  rematched := v_match_id IS DISTINCT FROM p_sku_id;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.resolve_purchase_line_existing_barcode(uuid, uuid, uuid, text, text, integer) IS
  'If a purchase line barcode already exists on a live org variant, return that sku/product. Raises when the line barcode would diverge from the stocked item and no live match exists. No backfill of existing rows.';

REVOKE ALL ON FUNCTION public.resolve_purchase_line_existing_barcode(uuid, uuid, uuid, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_purchase_line_existing_barcode(uuid, uuid, uuid, text, text, integer) TO authenticated, service_role;

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
  'BEFORE INSERT/UPDATE backstop: purchase_items.barcode must match the live barcode of sku_id, else rematch to the existing item. Runs during bulk purchase save (does not honour app.bulk_purchase_insert).';

DROP TRIGGER IF EXISTS trg_purchase_item_match_existing_barcode ON public.purchase_items;
CREATE TRIGGER trg_purchase_item_match_existing_barcode
  BEFORE INSERT OR UPDATE ON public.purchase_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_purchase_item_match_existing_barcode();

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

  -- Attach lines whose barcode already exists on a live item (before stock apply).
  SELECT COALESCE(
    jsonb_agg(
      t.value || jsonb_build_object(
        'sku_id', resolved.sku_id,
        'product_id', resolved.product_id
      )
      ORDER BY t.ordinality
    ),
    '[]'::jsonb
  )
  INTO p_items
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ordinality)
  CROSS JOIN LATERAL public.resolve_purchase_line_existing_barcode(
    p_organization_id,
    NULLIF(t.value->>'sku_id', '')::uuid,
    NULLIF(t.value->>'product_id', '')::uuid,
    t.value->>'barcode',
    t.value->>'size',
    t.ordinality::integer
  ) AS resolved;

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

  -- Guardrail: stock-tracked lines only (service products intentionally skip stock_movements).
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

  -- Guardrail: line barcode must equal the barcode of the item that received stock.
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
  'Atomic purchase bill save. Rematches line barcodes to live items, bulk stock effects, stock-tracked qty guardrail, and line-barcode=stocked-item-barcode guardrail.';

GRANT EXECUTE ON FUNCTION public.save_purchase_bill_with_items_atomic(uuid, jsonb, jsonb) TO authenticated, service_role;
