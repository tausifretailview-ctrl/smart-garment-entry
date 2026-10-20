-- Customer birthday and anniversary for wishes / offers (Customer Master,
-- Birthdays & Anniversaries window, Bulk WhatsApp picker). Plain dates; only
-- day and month are used. Nullable, no default, so existing rows are untouched.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS anniversary date;

COMMENT ON COLUMN public.customers.birthday IS 'Customer birthday (day/month used for wishes).';
COMMENT ON COLUMN public.customers.anniversary IS 'Customer wedding anniversary (day/month used for wishes).';
