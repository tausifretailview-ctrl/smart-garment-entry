-- READ-ONLY: Shumama Baireli (ELLA NOOR) — run ONE block at a time in Supabase SQL editor.
-- Customer: 224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9
-- Org:      3fdca631-1e0c-4417-9704-421f5129ff67
-- Expect after 20260817120000: get_customer_true_outstanding ≈ -12850 (negative = customer in credit)
-- (Prior bug showed ≈ -419550 from advance double-count in receipt_payments.)

-- Block 1: lifetime outstanding (signed: negative = Cr)
SELECT public.get_customer_true_outstanding(
  '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9'::uuid,
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
) AS true_outstanding;

-- Block 2: financial snapshot (outstanding_dr uses same sign as above)
SELECT *
FROM public.get_customer_financial_snapshot(
  '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9'::uuid,
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
);

-- Block 3: reconcile line items (sum of amount ≈ true_outstanding)
SELECT source, amount, detail
FROM public.reconcile_customer_balance(
  '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9'::uuid,
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
)
ORDER BY source;

-- Block 4: org reconciler row (calculated_balance should match block 1 after migration 20260803120100)
SELECT customer_name, total_invoices, total_advance_used, total_sale_returns,
       calculated_balance, advance_available, notes
FROM public.reconcile_customer_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
WHERE customer_id = '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9'::uuid;

-- Block 5: pending sale returns CAB
SELECT return_number, net_amount, credit_status, credit_available_balance
FROM public.sale_returns
WHERE customer_id = '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9'::uuid
  AND organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND deleted_at IS NULL
  AND lower(trim(credit_status)) = 'pending';
