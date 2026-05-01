-- Phase 1 rollout safety: keep accounting engine disabled by default per org.
-- This allows controlled pilot enablement without changing live behavior globally.

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS accounting_engine_enabled BOOLEAN NOT NULL DEFAULT false;

-- Helpful index for failed-journal dashboard/retry lookups.
CREATE INDEX IF NOT EXISTS idx_sales_org_journal_status
  ON public.sales (organization_id, journal_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_bills_org_journal_status
  ON public.purchase_bills (organization_id, journal_status)
  WHERE deleted_at IS NULL;

