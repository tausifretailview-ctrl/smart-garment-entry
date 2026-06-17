-- Supplier invoice OUR serial counter: ignore user-typed supplier numbers.
-- supplier_inv_auto_generated = true only when the client used the auto-suggested serial unchanged.
-- Backfill is manual — run scripts/supplier-inv-serial-backfill-review.sql and confirm boundary first.

ALTER TABLE public.purchase_bills
  ADD COLUMN IF NOT EXISTS supplier_inv_auto_generated boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.purchase_bills.supplier_inv_auto_generated IS
  'True when supplier_invoice_no was our org-wide numeric serial (auto-suggest). False for supplier-typed numbers; excluded from _next_supplier_invoice_in_series.';

CREATE OR REPLACE FUNCTION public._next_supplier_invoice_in_series(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  max_num bigint;
BEGIN
  SELECT MAX(supplier_invoice_no::bigint)
  INTO max_num
  FROM public.purchase_bills
  WHERE organization_id = p_organization_id
    AND deleted_at IS NULL
    AND (is_cancelled IS NULL OR is_cancelled = false)
    AND supplier_inv_auto_generated = true
    AND supplier_invoice_no IS NOT NULL
    AND trim(supplier_invoice_no) <> ''
    AND supplier_invoice_no ~ '^\d+$';

  IF max_num IS NULL THEN
    RETURN '1';
  END IF;

  RETURN (max_num + 1)::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_purchase_bill_with_items_atomic(
  p_organization_id UUID,
  p_bill JSONB,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_bill_no TEXT;
  v_bill_id UUID;
  v_item JSONB;
  v_idx INTEGER := 0;
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

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_idx := v_idx + 1;
    IF COALESCE(v_item->>'sku_id', '') = '' THEN
      RAISE EXCEPTION 'Line %: sku_id is required', v_idx;
    END IF;
    IF COALESCE((v_item->>'qty')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Line %: qty must be greater than 0', v_idx;
    END IF;
    IF COALESCE(v_item->>'product_id', '') = '' THEN
      RAISE EXCEPTION 'Line %: product_id is required', v_idx;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM product_variants pv
      WHERE pv.id = (v_item->>'sku_id')::uuid
        AND pv.deleted_at IS NULL
        AND pv.organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'Line %: variant % not found for organization', v_idx, v_item->>'sku_id';
    END IF;
  END LOOP;

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

  RETURN to_jsonb(v_inserted_bill);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_purchase_bill_with_items_atomic(uuid, jsonb, jsonb) TO authenticated;
