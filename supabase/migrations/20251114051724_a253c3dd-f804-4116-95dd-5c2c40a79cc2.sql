-- Create sales table for POS and invoice transactions
CREATE TABLE public.sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_number TEXT NOT NULL UNIQUE,
  sale_type TEXT NOT NULL CHECK (sale_type IN ('pos', 'invoice')),
  sale_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Customer information
  customer_name TEXT NOT NULL DEFAULT 'Walk in Customer',
  customer_phone TEXT,
  customer_email TEXT,
  customer_address TEXT,
  
  -- Financial details
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  flat_discount_percent NUMERIC NOT NULL DEFAULT 0,
  flat_discount_amount NUMERIC NOT NULL DEFAULT 0,
  round_off NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  
  -- Payment information
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'upi', 'multiple', 'pay_later')),
  payment_status TEXT NOT NULL DEFAULT 'completed' CHECK (payment_status IN ('completed', 'pending', 'partial')),
  
  -- Additional details
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sale_items table for individual line items
CREATE TABLE public.sale_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  
  -- Product details
  product_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  product_name TEXT NOT NULL,
  size TEXT NOT NULL,
  barcode TEXT,
  
  -- Pricing
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL,
  mrp NUMERIC NOT NULL,
  gst_percent INTEGER NOT NULL DEFAULT 0,
  discount_percent NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX idx_sales_sale_date ON public.sales(sale_date DESC);
CREATE INDEX idx_sales_customer_name ON public.sales(customer_name);
CREATE INDEX idx_sales_sale_number ON public.sales(sale_number);
CREATE INDEX idx_sales_created_by ON public.sales(created_by);
CREATE INDEX idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX idx_sale_items_product_id ON public.sale_items(product_id);

-- Enable RLS
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sales
CREATE POLICY "Authenticated users can view sales"
  ON public.sales FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert sales"
  ON public.sales FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins and managers can update sales"
  ON public.sales FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Only admins can delete sales"
  ON public.sales FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for sale_items
CREATE POLICY "Authenticated users can view sale items"
  ON public.sale_items FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert sale items"
  ON public.sale_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Only admins can delete sale items"
  ON public.sale_items FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updating updated_at
CREATE TRIGGER update_sales_updated_at
  BEFORE UPDATE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to generate sale number
CREATE OR REPLACE FUNCTION public.generate_sale_number()
RETURNS TEXT AS $$
DECLARE
  next_number INTEGER;
  current_year TEXT;
  sale_num TEXT;
BEGIN
  current_year := TO_CHAR(CURRENT_DATE, 'YY-YY');
  
  -- Get the next number for this year
  SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM '\d+$') AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.sales
  WHERE sale_number LIKE 'SALE/' || current_year || '/%';
  
  sale_num := 'SALE/' || current_year || '/' || LPAD(next_number::TEXT, 5, '0');
  
  RETURN sale_num;
END;
$$ LANGUAGE plpgsql;

-- Create function to reduce stock on sale
CREATE OR REPLACE FUNCTION public.update_stock_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  -- Reduce stock quantity for the variant
  UPDATE product_variants
  SET stock_qty = stock_qty - NEW.quantity
  WHERE id = NEW.variant_id;
  
  -- Insert stock movement record
  INSERT INTO stock_movements (
    variant_id,
    movement_type,
    quantity,
    reference_id,
    notes
  ) VALUES (
    NEW.variant_id,
    'sale',
    -NEW.quantity,
    NEW.sale_id,
    'Stock reduced due to sale'
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to update stock on sale
CREATE TRIGGER trigger_update_stock_on_sale
  AFTER INSERT ON public.sale_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_stock_on_sale();