-- Phase 2: Purchase Entry DB hardening
-- 1) Validate active purchase_items rows (sku_id + qty > 0)
-- 2) Fail stock triggers loudly when sku_id missing / variant not found
-- 3) Atomic save RPC: purchase_bills + purchase_items in one transaction

CREATE OR REPLACE FUNCTION public.validate_purchase_item_active_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
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
    SELECT 1 FROM product_variants pv
    WHERE pv.id = NEW.sku_id
      AND pv.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Purchase line sku_id % not found in product_variants', NEW.sku_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_purchase_item_active_row ON public.purchase_items;
CREATE TRIGGER trg_validate_purchase_item_active_row
  BEFORE INSERT OR UPDATE ON public.purchase_items
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_purchase_item_active_row();

CREATE OR REPLACE FUNCTION public.update_stock_on_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_purchase_date TIMESTAMPTZ;
  v_bill_number TEXT;
  v_org_id UUID;
  v_rows_updated INTEGER;
BEGIN
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
  FROM purchase_bills
  WHERE id = NEW.bill_id;

  UPDATE product_variants
  SET stock_qty = stock_qty + NEW.qty, updated_at = NOW()
  WHERE id = NEW.sku_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Cannot add purchase stock: variant % not found', NEW.sku_id;
  END IF;

  INSERT INTO batch_stock (variant_id, bill_number, quantity, purchase_bill_id, purchase_date, organization_id)
  VALUES (NEW.sku_id, v_bill_number, NEW.qty, NEW.bill_id, v_purchase_date, v_org_id)
  ON CONFLICT (variant_id, bill_number)
  DO UPDATE SET quantity = batch_stock.quantity + EXCLUDED.quantity, updated_at = NOW();

  INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
  VALUES (NEW.sku_id, 'purchase', NEW.qty, NEW.bill_id, v_bill_number, 'Stock added from purchase bill ' || v_bill_number, v_org_id, auth.uid());

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_purchase_item_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_qty_difference NUMERIC;
  v_purchase_date TIMESTAMPTZ;
  v_bill_number TEXT;
  v_org_id UUID;
  v_rows_updated INTEGER;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.sku_id IS NULL THEN
    RAISE EXCEPTION 'Cannot adjust purchase stock: sku_id is missing';
  END IF;

  IF COALESCE(NEW.qty, 0) <= 0 THEN
    RAISE EXCEPTION 'Cannot adjust purchase stock: qty must be greater than 0';
  END IF;

  IF OLD.qty = NEW.qty THEN
    RETURN NEW;
  END IF;

  v_qty_difference := NEW.qty - OLD.qty;

  SELECT pb.bill_date, pb.software_bill_no, pb.organization_id
  INTO v_purchase_date, v_bill_number, v_org_id
  FROM purchase_bills pb
  WHERE pb.id = NEW.bill_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID not found for purchase bill';
  END IF;

  UPDATE product_variants
  SET stock_qty = stock_qty + v_qty_difference, updated_at = NOW()
  WHERE id = NEW.sku_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Cannot adjust purchase stock: variant % not found', NEW.sku_id;
  END IF;

  UPDATE batch_stock
  SET quantity = quantity + v_qty_difference, updated_at = NOW()
  WHERE variant_id = NEW.sku_id AND bill_number = v_bill_number;

  INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
  VALUES (
    NEW.sku_id,
    CASE WHEN v_qty_difference > 0 THEN 'purchase_increase' ELSE 'purchase_decrease' END,
    v_qty_difference,
    NEW.bill_id,
    v_bill_number,
    'Stock adjusted: Purchase quantity changed from ' || OLD.qty || ' to ' || NEW.qty || ' in bill ' || v_bill_number,
    v_org_id,
    auth.uid()
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in purchase_item_update trigger: %', SQLERRM;
END;
$function$;

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
