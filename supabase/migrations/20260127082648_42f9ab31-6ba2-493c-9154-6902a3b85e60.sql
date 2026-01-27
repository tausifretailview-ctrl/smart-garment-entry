-- Add UOM column to sale_order_items table for storing unit of measurement per line item
ALTER TABLE public.sale_order_items 
ADD COLUMN IF NOT EXISTS uom TEXT DEFAULT 'NOS';

-- Add comment for clarity
COMMENT ON COLUMN public.sale_order_items.uom IS 'Unit of Measurement for the line item (e.g., NOS, KG, PCS)';