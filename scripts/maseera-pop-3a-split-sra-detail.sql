-- =============================================================================
-- MASEERA pop 3a — FIFO-split SRA detail (two+ SRs share one linked_sale_id)
-- READ ONLY. Paste this entire file as ONE run. Do not click Format SQL first.
--
-- Maseera class: remaining used full invoice SRA instead of allocated CN slice.
-- Expected columns: org_name, customer_name, sale_number, sale_return_adjust,
--   sr_count, sr_net_sum, return_numbers
-- =============================================================================

SELECT
  o.name AS org_name,
  c.customer_name,
  s.sale_number,
  s.sale_return_adjust,
  COUNT(*) AS sr_count,
  SUM(sr.net_amount) AS sr_net_sum,
  ARRAY_AGG(sr.return_number ORDER BY sr.return_date, sr.created_at) AS return_numbers
FROM public.sale_returns sr
JOIN public.organizations o ON o.id = sr.organization_id
JOIN public.customers c
  ON c.id = sr.customer_id AND c.organization_id = sr.organization_id
JOIN public.sales s
  ON s.id = sr.linked_sale_id AND s.organization_id = sr.organization_id
WHERE sr.deleted_at IS NULL
  AND sr.linked_sale_id IS NOT NULL
  AND s.deleted_at IS NULL
GROUP BY o.name, c.customer_name, s.sale_number, s.sale_return_adjust
HAVING COUNT(*) >= 2
ORDER BY o.name, c.customer_name;
