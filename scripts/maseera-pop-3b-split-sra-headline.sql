-- =============================================================================
-- MASEERA pop 3b — FIFO-split SRA headline counts
-- READ ONLY. Paste this entire file as ONE run. Do not click Format SQL first.
--
-- Live paste 18 Sep 2026 (this file / last statement of the combined paste):
--   customer_count=11  org_count=4  split_invoice_count=11
-- Expected columns: split_invoice_count, customer_count, org_count
-- =============================================================================

SELECT
  COUNT(*) AS split_invoice_count,
  COUNT(DISTINCT customer_name) AS customer_count,
  COUNT(DISTINCT org_name) AS org_count
FROM (
  SELECT
    o.name AS org_name,
    c.customer_name,
    s.id
  FROM public.sale_returns sr
  JOIN public.organizations o ON o.id = sr.organization_id
  JOIN public.customers c
    ON c.id = sr.customer_id AND c.organization_id = sr.organization_id
  JOIN public.sales s
    ON s.id = sr.linked_sale_id AND s.organization_id = sr.organization_id
  WHERE sr.deleted_at IS NULL
    AND sr.linked_sale_id IS NOT NULL
    AND s.deleted_at IS NULL
  GROUP BY o.name, c.customer_name, s.id
  HAVING COUNT(*) >= 2
) x;
