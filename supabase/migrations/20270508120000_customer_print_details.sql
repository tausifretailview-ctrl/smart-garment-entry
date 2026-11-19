-- Customer Master -> "Print on bill": the name and address printed on bills, when they differ
-- from the name used to search the customer (e.g. search "R. C. KAMLAPURE - RAKESH FASHION -
-- GULBARGA {CASH}", print "M/s. R. C. KAMLAPURE").
--
--   customers.print_name      name printed on bills (blank = customer_name)
--   customers.print_address   street / area lines
--   customers.print_place     city / town
--   customers.print_pincode
--   customers.print_state
--   customers.print_country   (blank = not printed; India is assumed)
--
-- When every print_* address field is blank the bill prints customers.address as before.
-- Shop members already read and edit customers; nothing else changes. No backfill.
-- Safe to run more than once.
-- UNDO: ALTER TABLE public.customers DROP COLUMN print_name, DROP COLUMN print_address,
--         DROP COLUMN print_place, DROP COLUMN print_pincode, DROP COLUMN print_state,
--         DROP COLUMN print_country;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS print_name text,
  ADD COLUMN IF NOT EXISTS print_address text,
  ADD COLUMN IF NOT EXISTS print_place text,
  ADD COLUMN IF NOT EXISTS print_pincode text,
  ADD COLUMN IF NOT EXISTS print_state text,
  ADD COLUMN IF NOT EXISTS print_country text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_print_details_len') THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_print_details_len CHECK (
        coalesce(length(print_name), 0) <= 160
        AND coalesce(length(print_address), 0) <= 400
        AND coalesce(length(print_place), 0) <= 80
        AND coalesce(length(print_pincode), 0) <= 12
        AND coalesce(length(print_state), 0) <= 60
        AND coalesce(length(print_country), 0) <= 60
      );
  END IF;
END $$;

COMMENT ON COLUMN public.customers.print_name IS
  'Name printed on bills. Blank = customer_name (the name used to search the customer).';
COMMENT ON COLUMN public.customers.print_address IS
  'Printed address lines. With print_place / print_pincode / print_state / print_country; all blank = address.';

NOTIFY pgrst, 'reload schema';
