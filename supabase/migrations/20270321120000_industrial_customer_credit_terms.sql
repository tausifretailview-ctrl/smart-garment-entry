-- Industrial mode, Phase 1 step 1: party credit terms on customers.
-- Nullable columns, no defaults: existing rows and retail shops are unchanged.
-- The app only reads or writes them when the shop has Industrial mode on.

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS credit_limit numeric(14,2);
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS credit_days integer;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS contact_person text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS pan_number text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_credit_limit_nonneg') THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_credit_limit_nonneg CHECK (credit_limit IS NULL OR credit_limit >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_credit_days_range') THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_credit_days_range CHECK (credit_days IS NULL OR (credit_days >= 0 AND credit_days <= 365));
  END IF;
END $$;

COMMENT ON COLUMN public.customers.credit_limit IS 'Industrial mode: max outstanding allowed (NULL = no limit)';
COMMENT ON COLUMN public.customers.credit_days IS 'Industrial mode: bill due date = bill date + credit days';
