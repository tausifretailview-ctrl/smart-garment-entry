-- Phase 3 — small-instance hotspot indexes
-- Voucher_entries.description is searched via 12-way ilike OR chains
-- (customerBalanceUtils, customerAuditBundle, CustomerLedger, CreditNote dialogs).
-- A GIN trigram index lets the planner use the index instead of a full scan
-- once the existing org_type/org_date filters narrow the rowset.

CREATE INDEX IF NOT EXISTS idx_voucher_entries_description_trgm
  ON public.voucher_entries
  USING gin (description extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL AND description IS NOT NULL;

-- Composite to make the receipt-split query (org + voucher_type + ref_type IN(...) + description ilike)
-- index-only on the leading filters before the trigram scan.
CREATE INDEX IF NOT EXISTS idx_voucher_entries_org_type_ref_type
  ON public.voucher_entries (organization_id, voucher_type, reference_type)
  WHERE deleted_at IS NULL;