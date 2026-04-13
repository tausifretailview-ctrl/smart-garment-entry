
-- Stock ceiling trigger: prevents stock from exceeding total purchased qty
CREATE OR REPLACE FUNCTION public.check_stock_ceiling_on_sale_return()
RETURNS TRIGGER AS $$
DECLARE
  v_current_stock    NUMERIC;
  v_total_purchased  NUMERIC;
  v_total_returned   NUMERIC;
  v_max_allowed      NUMERIC;
  v_projected        NUMERIC;
  v_product_type     TEXT;
BEGIN
  -- Skip if no variant (custom sizes)
  IF NEW.variant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get current stock and product type
  SELECT pv.stock_qty, p.product_type
  INTO v_current_stock, v_product_type
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = NEW.variant_id;

  -- Services/combos don't track stock
  IF v_product_type IN ('service', 'combo') THEN
    RETURN NEW;
  END IF;

  v_current_stock := COALESCE(v_current_stock, 0);

  -- Total purchased for this variant (active rows)
  SELECT COALESCE(SUM(qty), 0) INTO v_total_purchased
  FROM public.purchase_items
  WHERE sku_id = NEW.variant_id
    AND deleted_at IS NULL;

  -- Total purchase-returned for this variant (active rows)
  SELECT COALESCE(SUM(qty), 0) INTO v_total_returned
  FROM public.purchase_return_items
  WHERE sku_id = NEW.variant_id
    AND deleted_at IS NULL;

  v_max_allowed := v_total_purchased - v_total_returned;
  v_projected   := v_current_stock + NEW.quantity;

  IF v_projected > v_max_allowed THEN
    RAISE EXCEPTION 'Stock ceiling exceeded for variant %. Current: %, Adding: %, Max allowed: % (purchased: %, returned: %)',
      NEW.variant_id, v_current_stock, NEW.quantity, v_max_allowed, v_total_purchased, v_total_returned;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach trigger
DROP TRIGGER IF EXISTS enforce_stock_ceiling_on_sale_return ON public.sale_return_items;
CREATE TRIGGER enforce_stock_ceiling_on_sale_return
  BEFORE INSERT ON public.sale_return_items
  FOR EACH ROW
  EXECUTE FUNCTION public.check_stock_ceiling_on_sale_return();
