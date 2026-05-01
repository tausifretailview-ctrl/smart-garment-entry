ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS journal_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS journal_error TEXT NULL;

ALTER TABLE public.purchase_bills
  ADD COLUMN IF NOT EXISTS journal_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS journal_error TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_journal_status_check'
      AND conrelid = 'public.sales'::regclass
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_journal_status_check
      CHECK (journal_status IN ('pending', 'posted', 'failed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_bills_journal_status_check'
      AND conrelid = 'public.purchase_bills'::regclass
  ) THEN
    ALTER TABLE public.purchase_bills
      ADD CONSTRAINT purchase_bills_journal_status_check
      CHECK (journal_status IN ('pending', 'posted', 'failed'));
  END IF;
END $$;

