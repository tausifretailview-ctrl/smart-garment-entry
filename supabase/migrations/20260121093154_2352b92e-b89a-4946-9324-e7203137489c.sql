-- Create purchase_orders table (similar to sale_orders)
CREATE TABLE public.purchase_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  order_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expected_delivery_date DATE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL DEFAULT 'Walk in Supplier',
  supplier_phone TEXT,
  supplier_email TEXT,
  supplier_address TEXT,
  supplier_gst TEXT,
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  gst_amount NUMERIC NOT NULL DEFAULT 0,
  other_charges NUMERIC NOT NULL DEFAULT 0,
  round_off NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  tax_type TEXT DEFAULT 'exclusive',
  notes TEXT,
  terms_conditions TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(organization_id, order_number)
);

-- Create purchase_order_items table (similar to sale_order_items)
CREATE TABLE public.purchase_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  size TEXT NOT NULL,
  barcode TEXT,
  color TEXT,
  hsn_code TEXT,
  order_qty INTEGER NOT NULL,
  fulfilled_qty INTEGER NOT NULL DEFAULT 0,
  pending_qty INTEGER NOT NULL,
  unit_price NUMERIC NOT NULL,
  gst_percent INTEGER NOT NULL DEFAULT 0,
  discount_percent NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable Row Level Security
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for purchase_orders
CREATE POLICY "Users can view purchase orders in their organization" 
ON public.purchase_orders 
FOR SELECT 
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can create purchase orders in their organization" 
ON public.purchase_orders 
FOR INSERT 
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.organization_members 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update purchase orders in their organization" 
ON public.purchase_orders 
FOR UPDATE 
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete purchase orders in their organization" 
ON public.purchase_orders 
FOR DELETE 
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members 
    WHERE user_id = auth.uid()
  )
);

-- Create RLS policies for purchase_order_items (based on order's organization)
CREATE POLICY "Users can view purchase order items" 
ON public.purchase_order_items 
FOR SELECT 
USING (
  order_id IN (
    SELECT id FROM public.purchase_orders 
    WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members 
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can create purchase order items" 
ON public.purchase_order_items 
FOR INSERT 
WITH CHECK (
  order_id IN (
    SELECT id FROM public.purchase_orders 
    WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members 
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update purchase order items" 
ON public.purchase_order_items 
FOR UPDATE 
USING (
  order_id IN (
    SELECT id FROM public.purchase_orders 
    WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members 
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can delete purchase order items" 
ON public.purchase_order_items 
FOR DELETE 
USING (
  order_id IN (
    SELECT id FROM public.purchase_orders 
    WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members 
      WHERE user_id = auth.uid()
    )
  )
);

-- Create function to generate purchase order number
CREATE OR REPLACE FUNCTION public.generate_purchase_order_number(p_organization_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_number INTEGER;
  v_order_number TEXT;
BEGIN
  -- Get the next sequential number
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 'PO-([0-9]+)$') AS INTEGER)), 0) + 1
  INTO v_next_number
  FROM purchase_orders
  WHERE organization_id = p_organization_id;
  
  -- Format with prefix
  v_order_number := 'PO-' || LPAD(v_next_number::TEXT, 5, '0');
  
  RETURN v_order_number;
END;
$$;

-- Create indexes for better performance
CREATE INDEX idx_purchase_orders_org_id ON public.purchase_orders(organization_id);
CREATE INDEX idx_purchase_orders_status ON public.purchase_orders(status);
CREATE INDEX idx_purchase_orders_supplier_id ON public.purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_order_date ON public.purchase_orders(order_date);
CREATE INDEX idx_purchase_order_items_order_id ON public.purchase_order_items(order_id);
CREATE INDEX idx_purchase_order_items_product_id ON public.purchase_order_items(product_id);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_purchase_orders_updated_at
BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();