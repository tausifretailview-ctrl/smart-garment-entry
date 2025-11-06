-- Create size_groups table
CREATE TABLE IF NOT EXISTS public.size_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_name TEXT NOT NULL UNIQUE,
  sizes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create products table
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  style TEXT,
  color TEXT,
  size_group_id UUID REFERENCES public.size_groups(id),
  hsn_code TEXT,
  gst_per INTEGER CHECK (gst_per IN (0, 5, 12, 18, 28)),
  default_pur_price DECIMAL(10, 2) DEFAULT 0 CHECK (default_pur_price >= 0),
  default_sale_price DECIMAL(10, 2) DEFAULT 0 CHECK (default_sale_price >= 0),
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create product_variants table
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  pur_price DECIMAL(10, 2) DEFAULT 0 CHECK (pur_price >= 0),
  sale_price DECIMAL(10, 2) DEFAULT 0 CHECK (sale_price >= 0),
  barcode TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(product_id, size)
);

-- Enable Row Level Security
ALTER TABLE public.size_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for size_groups (allow all operations for authenticated users)
CREATE POLICY "Allow all operations on size_groups for authenticated users"
  ON public.size_groups
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create RLS policies for products (allow all operations for authenticated users)
CREATE POLICY "Allow all operations on products for authenticated users"
  ON public.products
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create RLS policies for product_variants (allow all operations for authenticated users)
CREATE POLICY "Allow all operations on product_variants for authenticated users"
  ON public.product_variants
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create update timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at columns
CREATE TRIGGER update_size_groups_updated_at
  BEFORE UPDATE ON public.size_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert sample size groups
INSERT INTO public.size_groups (group_name, sizes) VALUES
  ('Standard Apparel', '["XS", "S", "M", "L", "XL", "XXL"]'::jsonb),
  ('Kids Sizes', '["2T", "3T", "4T", "5T", "6", "7", "8", "10", "12"]'::jsonb),
  ('Numeric Sizes', '["28", "30", "32", "34", "36", "38", "40", "42"]'::jsonb),
  ('Shoe Sizes', '["6", "7", "8", "9", "10", "11", "12"]'::jsonb)
ON CONFLICT (group_name) DO NOTHING;