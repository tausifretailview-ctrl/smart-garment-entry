-- Primary: ledger/outstanding queries filtering by org + voucher_type + reference_id
CREATE INDEX IF NOT EXISTS idx_voucher_entries_org_type_ref
  ON public.voucher_entries(organization_id, voucher_type, reference_id)
  WHERE deleted_at IS NULL;

-- Secondary: reference_type='customer' lookups (opening balance payments, refunds)
CREATE INDEX IF NOT EXISTS idx_voucher_entries_ref_type_id
  ON public.voucher_entries(reference_type, reference_id)
  WHERE deleted_at IS NULL;

-- Tertiary: fast voucher_type filtering within org scans
CREATE INDEX IF NOT EXISTS idx_voucher_entries_org_type
  ON public.voucher_entries(organization_id, voucher_type)
  WHERE deleted_at IS NULL;