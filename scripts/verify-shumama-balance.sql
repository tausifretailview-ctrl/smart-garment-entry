-- READ-ONLY: Shumama Baireli (ELLA NOOR) balance verification after migrations
-- 20260803120000_backfill_pending_sale_return_cab.sql
-- 20260803120100_fix_reconcile_customer_balances_outstanding.sql
--
-- Customer: 224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9
-- Org:      3fdca631-1e0c-4417-9704-421f5129ff67

SELECT 'get_customer_true_outstanding' AS check_name,
       public.get_customer_true_outstanding(
         '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9'::uuid,
         '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
       ) AS amount,
       'expect ~ -17400 (Cr)' AS note;

SELECT outstanding_dr, advance_available, cn_available_total
FROM public.get_customer_financial_snapshot(
  '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9'::uuid,
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
);

SELECT customer_name, total_invoices, total_advance_used, total_sale_returns,
       calculated_balance, advance_available, notes
FROM public.reconcile_customer_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
WHERE customer_id = '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9'::uuid;

SELECT source, amount, detail
FROM public.reconcile_customer_balance(
  '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9'::uuid,
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
)
ORDER BY source;

SELECT return_number, net_amount, credit_status, credit_available_balance
FROM public.sale_returns
WHERE customer_id = '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9'::uuid
  AND organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND deleted_at IS NULL
  AND lower(trim(credit_status)) = 'pending';
