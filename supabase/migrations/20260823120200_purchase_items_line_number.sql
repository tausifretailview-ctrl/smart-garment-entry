-- Preserve purchase bill line order as entered (bulk inserts shared created_at → UUID sort scrambled rows).

ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS line_number integer NOT NULL DEFAULT 0;

WITH numbered AS (
  SELECT
    pi.id,
    ROW_NUMBER() OVER (
      PARTITION BY pi.bill_id
      ORDER BY pi.created_at ASC, pi.id ASC
    )::integer AS rn
  FROM public.purchase_items pi
  WHERE pi.deleted_at IS NULL
)
UPDATE public.purchase_items pi
SET line_number = numbered.rn
FROM numbered
WHERE pi.id = numbered.id
  AND pi.line_number = 0;

CREATE INDEX IF NOT EXISTS idx_purchase_items_bill_line_number
  ON public.purchase_items (bill_id, line_number)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.purchase_items.line_number IS
  '1-based entry order on the purchase bill screen; stable across reload/print.';

-- Atomic save: persist array order as line_number (WITH ORDINALITY).
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

  RETURN to_jsonb(v_inserted_bill);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_purchase_bill_with_items_atomic(uuid, jsonb, jsonb) TO authenticated;
