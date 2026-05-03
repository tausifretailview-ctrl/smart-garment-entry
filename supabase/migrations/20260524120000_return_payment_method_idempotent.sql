-- Idempotent: ensure payment_method exists on return tables (no-op if phase 16 or prior migration already added it).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sale_returns' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE public.sale_returns ADD COLUMN payment_method text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_returns' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE public.purchase_returns ADD COLUMN payment_method text;
  END IF;
END $$;
