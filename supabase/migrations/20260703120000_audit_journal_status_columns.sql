-- audit_journal_status_columns (GL audit / resumable backfill)
-- Add journal_error column + composite indexes for fast pending lookups.
-- Safe to re-run: columns and indexes use IF NOT EXISTS.

ALTER TABLE public.sales            ADD COLUMN IF NOT EXISTS journal_error TEXT;
ALTER TABLE public.purchase_bills   ADD COLUMN IF NOT EXISTS journal_error TEXT;
ALTER TABLE public.sale_returns     ADD COLUMN IF NOT EXISTS journal_error TEXT;
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS journal_error TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_org_jstatus
  ON public.sales (organization_id, journal_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_bills_org_jstatus
  ON public.purchase_bills (organization_id, journal_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sale_returns_org_jstatus
  ON public.sale_returns (organization_id, journal_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_returns_org_jstatus
  ON public.purchase_returns (organization_id, journal_status)
  WHERE deleted_at IS NULL;
