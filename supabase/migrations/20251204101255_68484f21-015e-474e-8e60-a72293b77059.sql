-- Add product_type column to products table
ALTER TABLE public.products 
ADD COLUMN product_type TEXT NOT NULL DEFAULT 'goods';

-- Add check constraint for valid product types
ALTER TABLE public.products 
ADD CONSTRAINT products_product_type_check 
CHECK (product_type IN ('goods', 'service', 'combo'));

-- Create index for product_type for faster filtering
CREATE INDEX idx_products_product_type ON public.products(product_type);