-- Create purchase_bills table
CREATE TABLE public.purchase_bills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_name TEXT NOT NULL,
  supplier_invoice_no TEXT,
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  gst_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create purchase_items table
CREATE TABLE public.purchase_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id UUID NOT NULL REFERENCES public.purchase_bills(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  size TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  pur_price NUMERIC NOT NULL DEFAULT 0,
  sale_price NUMERIC NOT NULL DEFAULT 0,
  gst_per INTEGER NOT NULL DEFAULT 0,
  hsn_code TEXT,
  barcode TEXT,
  line_total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.purchase_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

-- Create policies for purchase_bills
CREATE POLICY "Allow all operations on purchase_bills for authenticated users"
ON public.purchase_bills
FOR ALL
USING (true)
WITH CHECK (true);

-- Create policies for purchase_items
CREATE POLICY "Allow all operations on purchase_items for authenticated users"
ON public.purchase_items
FOR ALL
USING (true)
WITH CHECK (true);

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_purchase_bills_updated_at
BEFORE UPDATE ON public.purchase_bills
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_purchase_items_updated_at
BEFORE UPDATE ON public.purchase_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();