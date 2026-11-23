-- Customer ledger: index for "this shop's entries for this bill number".
--
-- Every bill edit (trg_sales_sync_customer_ledger), every sale return edit and the app's own
-- ledger clean-up delete or look up ledger entries by shop + voucher number:
--     WHERE organization_id = ? AND voucher_no = ? [AND voucher_type IN (...)]
-- The table only had single-column indexes (id, customer_id, organization_id,
-- transaction_date), so each of those read every ledger entry of the shop (review item D12,
-- confirmed on the live database on 23 Nov 2026).
--
-- Adds nothing but the index; no data is changed. Building it pauses new ledger writes for
-- the few seconds it takes, so run it at a quiet time.
CREATE INDEX IF NOT EXISTS idx_ledger_org_voucher_no
  ON public.customer_ledger_entries (organization_id, voucher_no);

ANALYZE public.customer_ledger_entries;
