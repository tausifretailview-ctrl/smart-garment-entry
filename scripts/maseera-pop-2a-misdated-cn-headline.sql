-- =============================================================================
-- MASEERA pop 2a — mis-dated CN Adjust rows (headline)
-- READ ONLY. Paste this entire file as ONE run. Do not click Format SQL first.
--
-- Class: credit_note_adjustment voucher_date ≠ linked sale_date
--   (INV/3122 was 09/09; RCP/4837 voucher_date is 18/09).
-- Expected columns: org_name, misdated_cn_adjust_rows, invoice_count, customer_count
-- =============================================================================

SELECT
  o.name AS org_name,
  COUNT(*) AS misdated_cn_adjust_rows,
  COUNT(DISTINCT ve.reference_id) AS invoice_count,
  COUNT(DISTINCT s.customer_id) AS customer_count
FROM public.voucher_entries ve
JOIN public.sales s
  ON s.id = ve.reference_id AND s.organization_id = ve.organization_id
JOIN public.organizations o ON o.id = ve.organization_id
WHERE ve.deleted_at IS NULL
  AND ve.voucher_type = 'receipt'
  AND ve.payment_method = 'credit_note_adjustment'
  AND s.deleted_at IS NULL
  AND ve.voucher_date IS DISTINCT FROM s.sale_date
GROUP BY o.name
ORDER BY misdated_cn_adjust_rows DESC;
