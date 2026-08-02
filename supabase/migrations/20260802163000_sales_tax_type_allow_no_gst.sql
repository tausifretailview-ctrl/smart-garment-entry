-- POS "Without GST" (Bill of Supply): allow tax_type = 'no_gst' on sales.
-- Previous check only permitted inclusive | exclusive, so saves failed with
-- "violates check constraint sales_tax_type_check".

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_tax_type_check;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_tax_type_check
  CHECK (tax_type = ANY (ARRAY['inclusive'::text, 'exclusive'::text, 'no_gst'::text]));
