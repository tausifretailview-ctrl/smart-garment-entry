-- Normalize legacy customer RECEIPT rows on voucher_entries:
-- Previously some flows stored (cash + settlement discount) in total_amount while
-- also populating discount_amount for CD. Ledger / voucherCredit use total + discount,
-- which double-counted. New app code stores total_amount = cash/bank only.
--
-- This UPDATE sets total_amount := total_amount - discount_amount where a settlement
-- discount exists, so total_amount + discount_amount stays the same AR settlement.
--
-- WHEN TO RUN
-- - Prefer running once on a snapshot BEFORE new receipts are created with the
--   fixed app (cash-only total_amount). If you already have post-fix receipts,
--   narrow the predicate (e.g. add AND created_at < 'YOUR_CUTOFF_UTC') after verifying
--   with the preview SELECT below.
--
-- JOURNAL / GL
-- - Posted journal lines used the old voucher numbers at insert time; this migration
--   does not rewrite journal_entries. If accounting_engine was on, review AR/cash
--   lines for affected vouchers or re-post from voucher_entries as your policy allows.
--
-- PREVIEW (run in SQL editor first):
-- SELECT id, voucher_number, voucher_date, reference_type, total_amount, discount_amount,
--        ROUND((COALESCE(total_amount,0) - COALESCE(discount_amount,0))::numeric, 2) AS new_total
-- FROM public.voucher_entries
-- WHERE lower(voucher_type::text) = 'receipt'
--   AND COALESCE(discount_amount, 0) > 0.009
--   AND COALESCE(total_amount, 0) > COALESCE(discount_amount, 0)
--   AND deleted_at IS NULL
--   AND lower(COALESCE(payment_method, '')) NOT IN ('advance_adjustment', 'credit_note_adjustment');

UPDATE public.voucher_entries ve
SET total_amount = GREATEST(
  0,
  ROUND((COALESCE(ve.total_amount, 0) - COALESCE(ve.discount_amount, 0))::numeric, 2)
)
WHERE lower(ve.voucher_type::text) = 'receipt'
  AND COALESCE(ve.discount_amount, 0) > 0.009
  AND COALESCE(ve.total_amount, 0) > COALESCE(ve.discount_amount, 0)
  AND ve.deleted_at IS NULL
  AND lower(COALESCE(ve.payment_method, '')) NOT IN ('advance_adjustment', 'credit_note_adjustment');
