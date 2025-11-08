-- Fix the function search path security issue
CREATE OR REPLACE FUNCTION update_stock_on_purchase()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update the stock quantity for the variant
  UPDATE product_variants
  SET stock_qty = stock_qty + NEW.qty
  WHERE id = NEW.sku_id;
  
  RETURN NEW;
END;
$$;