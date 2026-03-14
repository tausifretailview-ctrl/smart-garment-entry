ALTER TABLE public.sales DROP CONSTRAINT sales_sale_type_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_sale_type_check CHECK (sale_type = ANY (ARRAY['pos','invoice','delivery_challan']));