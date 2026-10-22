-- Customer Master: several ship-to addresses (branches) per customer.
-- Sale Bill picks one and keeps a text copy in sales.shipping_address
-- (blank = customer's main address). Safe to re-run.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS shipping_addresses jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.customers.shipping_addresses IS
  'Array of {label, address} ship-to branches; picked on Sale Bill.';

NOTIFY pgrst, 'reload schema';
