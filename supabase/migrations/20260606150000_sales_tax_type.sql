-- GST inclusive/exclusive mode for POS and Sale Invoice rows.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS tax_type TEXT NOT NULL DEFAULT 'inclusive';

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_tax_type_check;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_tax_type_check
  CHECK (tax_type = ANY (ARRAY['inclusive'::text, 'exclusive'::text]));
