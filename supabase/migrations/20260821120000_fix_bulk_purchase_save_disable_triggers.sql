-- Fix 42501: session_replication_role is superuser-only on Supabase.
-- Use transaction-local GUC app.bulk_purchase_insert so INSERT triggers skip
-- per-row work; save RPC applies set-based effects instead.
-- Safe under concurrency (unlike ALTER TABLE DISABLE TRIGGER).

CREATE OR REPLACE FUNCTION public.validate_purchase_item_active_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF COALESCE(current_setting('app.bulk_purchase_insert', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.sku_id IS NULL THEN
    RAISE EXCEPTION 'Purchase line requires sku_id for stock tracking (product: %, size: %)',
      COALESCE(NEW.product_name, 'unknown'), COALESCE(NEW.size, 'unknown');
  END IF;

  IF COALESCE(NEW.qty, 0) <= 0 THEN
    RAISE EXCEPTION 'Purchase line quantity must be greater than 0 (product: %, size: %)',
      COALESCE(NEW.product_name, 'unknown'), COALESCE(NEW.size, 'unknown');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_variants pv
    WHERE pv.id = NEW.sku_id
      AND pv.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Purchase line sku_id % not found in product_variants', NEW.sku_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_stock_on_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_purchase_date timestamptz;
  v_bill_number text;
  v_org_id uuid;
  v_rows_updated integer;
BEGIN
  IF COALESCE(current_setting('app.bulk_purchase_insert', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.sku_id IS NULL THEN
    RAISE EXCEPTION 'Cannot add purchase stock: sku_id is missing for product % size %',
      COALESCE(NEW.product_name, 'unknown'), COALESCE(NEW.size, 'unknown');
  END IF;

  IF COALESCE(NEW.qty, 0) <= 0 THEN
    RAISE EXCEPTION 'Cannot add purchase stock: qty must be greater than 0';
  END IF;

  SELECT bill_date, software_bill_no, organization_id
  INTO v_purchase_date, v_bill_number, v_org_id
  FROM public.purchase_bills
  WHERE id = NEW.bill_id;

  UPDATE public.product_variants
  SET stock_qty = stock_qty + NEW.qty, updated_at = NOW()
  WHERE id = NEW.sku_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Cannot add purchase stock: variant % not found', NEW.sku_id;
  END IF;

  INSERT INTO public.batch_stock (variant_id, bill_number, quantity, purchase_bill_id, purchase_date, organization_id)
  VALUES (NEW.sku_id, v_bill_number, NEW.qty, NEW.bill_id, v_purchase_date, v_org_id)
  ON CONFLICT (variant_id, bill_number)
  DO UPDATE SET quantity = public.batch_stock.quantity + EXCLUDED.quantity, updated_at = NOW();

  INSERT INTO public.stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
  VALUES (NEW.sku_id, 'purchase', NEW.qty, NEW.bill_id, v_bill_number, 'Stock added from purchase bill ' || v_bill_number, v_org_id, auth.uid());

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_last_purchase_prices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF COALESCE(current_setting('app.bulk_purchase_insert', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  IF NEW.sku_id IS NOT NULL THEN
    UPDATE public.product_variants
    SET
      last_purchase_pur_price = NEW.pur_price,
      last_purchase_sale_price = NEW.sale_price,
      last_purchase_mrp = NEW.mrp,
      last_purchase_date = NOW(),
      updated_at = NOW()
    WHERE id = NEW.sku_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_purchase_bill_total_qty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  target_bill_id uuid;
BEGIN
  IF COALESCE(current_setting('app.bulk_purchase_insert', true), '') = '1' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    target_bill_id := OLD.bill_id;
  ELSE
    target_bill_id := NEW.bill_id;
  END IF;

  UPDATE public.purchase_bills
  SET total_qty = (
    SELECT COALESCE(SUM(qty), 0)
    FROM public.purchase_items
    WHERE bill_id = target_bill_id
  )
  WHERE id = target_bill_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

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
