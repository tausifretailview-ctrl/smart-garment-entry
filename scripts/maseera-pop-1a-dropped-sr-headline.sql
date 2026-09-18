-- =============================================================================
-- MASEERA pop 1a — dropped Sale Return rows (headline)
-- READ ONLY. Paste this entire file as ONE run. Do not click Format SQL first.
-- The SQL editor often executes only the last statement in a multi-SELECT paste.
--
-- Class: credit_status = adjusted AND linked_sale_id set (ledger skip / now memo).
-- Expected columns: org_name, dropped_sr_rows, customer_count
-- =============================================================================

SELECT
  o.name AS org_name,
  COUNT(*) AS dropped_sr_rows,
  COUNT(DISTINCT sr.customer_id) AS customer_count
FROM public.sale_returns sr
JOIN public.organizations o ON o.id = sr.organization_id
WHERE sr.deleted_at IS NULL
  AND LOWER(COALESCE(sr.credit_status, '')) = 'adjusted'
  AND sr.linked_sale_id IS NOT NULL
GROUP BY o.name
ORDER BY dropped_sr_rows DESC;
