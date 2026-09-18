-- =============================================================================
-- MASEERA pop 2b — mis-dated CN Adjust sample (cap 200)
-- READ ONLY. Paste this entire file as ONE run. Do not click Format SQL first.
--
-- Expected columns: org_name, customer_name, sale_number, invoice_date,
--   cn_voucher_date, voucher_number, total_amount
-- ELLA NOOR / MASEERA / INV/26-27/3122 should appear (09/09 vs 18/09).
-- =============================================================================

SELECT
  o.name AS org_name,
  c.customer_name,
  s.sale_number,
  s.sale_date AS invoice_date,
  ve.voucher_date AS cn_voucher_date,
  ve.voucher_number,
  ve.total_amount
FROM public.voucher_entries ve
JOIN public.sales s
  ON s.id = ve.reference_id AND s.organization_id = ve.organization_id
JOIN public.organizations o ON o.id = ve.organization_id
JOIN public.customers c
  ON c.id = s.customer_id AND c.organization_id = s.organization_id
WHERE ve.deleted_at IS NULL
  AND ve.voucher_type = 'receipt'
  AND ve.payment_method = 'credit_note_adjustment'
  AND s.deleted_at IS NULL
  AND ve.voucher_date IS DISTINCT FROM s.sale_date
ORDER BY ve.organization_id, ve.voucher_date DESC
LIMIT 200;
