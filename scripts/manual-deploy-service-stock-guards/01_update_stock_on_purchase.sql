-- 1. update_stock_on_purchase
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
  v_product_type text;
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

  -- Service product guard
  SELECT p.product_type INTO v_product_type
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = NEW.sku_id
  LIMIT 1;

  IF v_product_type = 'service' THEN
    RETURN NEW;
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

