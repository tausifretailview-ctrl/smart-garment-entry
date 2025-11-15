-- Add supplier_id to purchase_bills
ALTER TABLE public.purchase_bills
ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id);

-- Add customer_id to sales
ALTER TABLE public.sales
ADD COLUMN customer_id uuid REFERENCES public.customers(id);

-- Add indexes for better performance
CREATE INDEX idx_purchase_bills_supplier_id ON public.purchase_bills(supplier_id);
CREATE INDEX idx_sales_customer_id ON public.sales(customer_id);