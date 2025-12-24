-- Add last purchase price columns to product_variants
ALTER TABLE product_variants 
ADD COLUMN IF NOT EXISTS last_purchase_pur_price NUMERIC,
ADD COLUMN IF NOT EXISTS last_purchase_sale_price NUMERIC,
ADD COLUMN IF NOT EXISTS last_purchase_mrp NUMERIC,
ADD COLUMN IF NOT EXISTS last_purchase_date TIMESTAMPTZ;

-- Create function to update last purchase prices when purchase items are inserted
CREATE OR REPLACE FUNCTION update_last_purchase_prices()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if sku_id is not null
  IF NEW.sku_id IS NOT NULL THEN
    UPDATE product_variants
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing trigger if exists and create new one
DROP TRIGGER IF EXISTS update_variant_last_purchase ON purchase_items;

CREATE TRIGGER update_variant_last_purchase
AFTER INSERT ON purchase_items
FOR EACH ROW
EXECUTE FUNCTION update_last_purchase_prices();