
CREATE OR REPLACE FUNCTION public.check_stock_ceiling_on_sale_return()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_stock numeric;
  v_opening_qty numeric;
  v_total_purchased numeric;
  v_total_returned numeric;
  v_max_allowed numeric;
  v_projected numeric;
  v_product_type text;
BEGIN
  -- Get current stock, opening qty, and product type
  SELECT pv.stock_qty, COALESCE(pv.opening_qty, 0), p.product_type
  INTO v_current_stock, v_opening_qty, v_product_type
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  WHERE pv.id = NEW.sku_id;

  -- Skip for service/combo products
  IF v_product_type IN ('service', 'combo') THEN
    RETURN NEW;
  END IF;

  -- Total purchased qty for this variant (active rows)
  SELECT COALESCE(SUM(pi.qty), 0)
  INTO v_total_purchased
  FROM purchase_items pi
  WHERE pi.sku_id = NEW.sku_id
    AND pi.deleted_at IS NULL;

  -- Total purchase-returned qty (active rows)
  SELECT COALESCE(SUM(pri.qty), 0)
  INTO v_total_returned
  FROM purchase_return_items pri
  WHERE pri.sku_id = NEW.sku_id
    AND pri.deleted_at IS NULL;

  v_max_allowed := v_opening_qty + v_total_purchased - v_total_returned;
  v_projected := COALESCE(v_current_stock, 0) + NEW.quantity;

  IF v_projected > v_max_allowed THEN
    RAISE EXCEPTION 'Stock ceiling exceeded for variant %. Current: %, Adding: %, Max allowed: % (Opening: %, Purchased: %, Returned: %)',
      NEW.sku_id, v_current_stock, NEW.quantity, v_max_allowed, v_opening_qty, v_total_purchased, v_total_returned;
  END IF;

  RETURN NEW;
END;
$$;
