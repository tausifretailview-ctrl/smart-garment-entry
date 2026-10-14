-- POS "2nd firm" header: which firm name a bill was printed under.
-- NULL = main organization; 'second' = Settings > Reports > 2nd billing details.
-- Header only: stock, accounts and bill numbers stay with the organization.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS print_firm TEXT;

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_print_firm_check;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_print_firm_check
  CHECK (print_firm IS NULL OR print_firm = 'second');
