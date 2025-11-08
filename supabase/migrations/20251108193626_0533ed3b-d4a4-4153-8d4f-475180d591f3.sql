-- Add stock_qty column to product_variants table
ALTER TABLE product_variants 
ADD COLUMN IF NOT EXISTS stock_qty integer DEFAULT 0 NOT NULL;

-- Add comment for clarity
COMMENT ON COLUMN product_variants.stock_qty IS 'Current stock quantity - increases with purchases, decreases with sales';

-- Create index for better performance on stock queries
CREATE INDEX IF NOT EXISTS idx_product_variants_stock_qty 
ON product_variants(stock_qty) 
WHERE stock_qty <= 10; -- Low stock index

-- Create a function to update stock on purchase
CREATE OR REPLACE FUNCTION update_stock_on_purchase()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the stock quantity for the variant
  UPDATE product_variants
  SET stock_qty = stock_qty + NEW.qty
  WHERE id = NEW.sku_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update stock when purchase items are inserted
DROP TRIGGER IF EXISTS trigger_update_stock_on_purchase ON purchase_items;
CREATE TRIGGER trigger_update_stock_on_purchase
AFTER INSERT ON purchase_items
FOR EACH ROW
EXECUTE FUNCTION update_stock_on_purchase();

-- Add stock history table for audit trail
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('purchase', 'sale', 'adjustment')),
  quantity integer NOT NULL,
  reference_id uuid, -- Can reference purchase_items.id or future sale_items.id
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  notes text
);

-- Enable RLS on stock_movements
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to view stock movements
CREATE POLICY "Authenticated users can view stock movements"
ON stock_movements FOR SELECT
TO authenticated
USING (true);

-- Policy for authenticated users to insert stock movements
CREATE POLICY "Authenticated users can insert stock movements"
ON stock_movements FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create index for stock movements
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant_id ON stock_movements(variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at DESC);