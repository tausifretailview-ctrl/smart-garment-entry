-- Create quotations table
CREATE TABLE public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  quotation_number TEXT NOT NULL,
  quotation_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  valid_until DATE,
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT NOT NULL DEFAULT 'Walk in Customer',
  customer_phone TEXT,
  customer_email TEXT,
  customer_address TEXT,
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  flat_discount_percent NUMERIC NOT NULL DEFAULT 0,
  flat_discount_amount NUMERIC NOT NULL DEFAULT 0,
  gst_amount NUMERIC NOT NULL DEFAULT 0,
  round_off NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  tax_type TEXT DEFAULT 'exclusive',
  notes TEXT,
  terms_conditions TEXT,
  shipping_address TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create quotation_items table
CREATE TABLE public.quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  product_name TEXT NOT NULL,
  size TEXT NOT NULL,
  barcode TEXT,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC NOT NULL,
  mrp NUMERIC NOT NULL,
  discount_percent NUMERIC NOT NULL DEFAULT 0,
  gst_percent INTEGER NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sale_orders table
CREATE TABLE public.sale_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  order_number TEXT NOT NULL,
  order_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expected_delivery_date DATE,
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT NOT NULL DEFAULT 'Walk in Customer',
  customer_phone TEXT,
  customer_email TEXT,
  customer_address TEXT,
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  flat_discount_percent NUMERIC NOT NULL DEFAULT 0,
  flat_discount_amount NUMERIC NOT NULL DEFAULT 0,
  gst_amount NUMERIC NOT NULL DEFAULT 0,
  round_off NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  tax_type TEXT DEFAULT 'exclusive',
  quotation_id UUID REFERENCES public.quotations(id),
  notes TEXT,
  terms_conditions TEXT,
  shipping_address TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sale_order_items table
CREATE TABLE public.sale_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.sale_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  product_name TEXT NOT NULL,
  size TEXT NOT NULL,
  barcode TEXT,
  order_qty INTEGER NOT NULL,
  fulfilled_qty INTEGER NOT NULL DEFAULT 0,
  pending_qty INTEGER NOT NULL,
  unit_price NUMERIC NOT NULL,
  mrp NUMERIC NOT NULL,
  discount_percent NUMERIC NOT NULL DEFAULT 0,
  gst_percent INTEGER NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_order_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for quotations
CREATE POLICY "Users can view quotations in their organizations"
ON public.quotations FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Users can create quotations in their organizations"
ON public.quotations FOR INSERT
WITH CHECK (user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Admins and managers can update quotations"
ON public.quotations FOR UPDATE
USING (user_belongs_to_org(auth.uid(), organization_id) AND 
       (has_org_role(auth.uid(), organization_id, 'admin') OR 
        has_org_role(auth.uid(), organization_id, 'manager')));

CREATE POLICY "Admins can delete quotations"
ON public.quotations FOR DELETE
USING (has_org_role(auth.uid(), organization_id, 'admin'));

-- RLS Policies for quotation_items
CREATE POLICY "Users can view quotation items"
ON public.quotation_items FOR SELECT
USING (quotation_id IN (SELECT id FROM public.quotations WHERE organization_id IN (SELECT get_user_organization_ids(auth.uid()))));

CREATE POLICY "Users can insert quotation items"
ON public.quotation_items FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can delete quotation items"
ON public.quotation_items FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for sale_orders
CREATE POLICY "Users can view sale orders in their organizations"
ON public.sale_orders FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Users can create sale orders in their organizations"
ON public.sale_orders FOR INSERT
WITH CHECK (user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Admins and managers can update sale orders"
ON public.sale_orders FOR UPDATE
USING (user_belongs_to_org(auth.uid(), organization_id) AND 
       (has_org_role(auth.uid(), organization_id, 'admin') OR 
        has_org_role(auth.uid(), organization_id, 'manager')));

CREATE POLICY "Admins can delete sale orders"
ON public.sale_orders FOR DELETE
USING (has_org_role(auth.uid(), organization_id, 'admin'));

-- RLS Policies for sale_order_items
CREATE POLICY "Users can view sale order items"
ON public.sale_order_items FOR SELECT
USING (order_id IN (SELECT id FROM public.sale_orders WHERE organization_id IN (SELECT get_user_organization_ids(auth.uid()))));

CREATE POLICY "Users can insert sale order items"
ON public.sale_order_items FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins and managers can update sale order items"
ON public.sale_order_items FOR UPDATE
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins can delete sale order items"
ON public.sale_order_items FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- Create indexes
CREATE INDEX idx_quotations_organization ON public.quotations(organization_id);
CREATE INDEX idx_quotations_customer ON public.quotations(customer_id);
CREATE INDEX idx_quotations_status ON public.quotations(status);
CREATE INDEX idx_quotation_items_quotation ON public.quotation_items(quotation_id);
CREATE INDEX idx_sale_orders_organization ON public.sale_orders(organization_id);
CREATE INDEX idx_sale_orders_customer ON public.sale_orders(customer_id);
CREATE INDEX idx_sale_orders_status ON public.sale_orders(status);
CREATE INDEX idx_sale_orders_quotation ON public.sale_orders(quotation_id);
CREATE INDEX idx_sale_order_items_order ON public.sale_order_items(order_id);

-- Function to generate quotation number
CREATE OR REPLACE FUNCTION public.generate_quotation_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_number INTEGER;
  financial_year TEXT;
  current_month INTEGER;
  current_year INTEGER;
  fy_start_year INTEGER;
  fy_end_year INTEGER;
  quotation_num TEXT;
BEGIN
  current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  current_year := EXTRACT(YEAR FROM CURRENT_DATE);
  
  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year := current_year;
  END IF;
  
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(quotation_number FROM 'QT/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.quotations
  WHERE quotation_number LIKE 'QT/' || financial_year || '/%'
    AND organization_id = p_organization_id;
  
  quotation_num := 'QT/' || financial_year || '/' || next_number::TEXT;
  
  RETURN quotation_num;
END;
$$;

-- Function to generate sale order number
CREATE OR REPLACE FUNCTION public.generate_sale_order_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_number INTEGER;
  financial_year TEXT;
  current_month INTEGER;
  current_year INTEGER;
  fy_start_year INTEGER;
  fy_end_year INTEGER;
  order_num TEXT;
BEGIN
  current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  current_year := EXTRACT(YEAR FROM CURRENT_DATE);
  
  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year := current_year;
  END IF;
  
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 'SO/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.sale_orders
  WHERE order_number LIKE 'SO/' || financial_year || '/%'
    AND organization_id = p_organization_id;
  
  order_num := 'SO/' || financial_year || '/' || next_number::TEXT;
  
  RETURN order_num;
END;
$$;