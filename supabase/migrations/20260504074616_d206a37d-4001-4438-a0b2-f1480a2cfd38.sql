-- Add missing accounting columns to sale_returns
ALTER TABLE public.sale_returns
  ADD COLUMN IF NOT EXISTS payment_method  text,
  ADD COLUMN IF NOT EXISTS journal_status  text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS journal_error   text;

-- Add missing accounting columns to purchase_returns
ALTER TABLE public.purchase_returns
  ADD COLUMN IF NOT EXISTS payment_method  text,
  ADD COLUMN IF NOT EXISTS journal_status  text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS journal_error   text;

-- Organization-scoped indexes for the journal repost worker / status filters
CREATE INDEX IF NOT EXISTS idx_sale_returns_journal_status
  ON public.sale_returns (organization_id, journal_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_returns_journal_status
  ON public.purchase_returns (organization_id, journal_status)
  WHERE deleted_at IS NULL;