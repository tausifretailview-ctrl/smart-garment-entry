-- =============================================================================
-- MASEERA pop 1b — dropped SRs that still have CN leftover
-- READ ONLY. Paste this entire file as ONE run. Do not click Format SQL first.
--
-- Skip + remainder class (Maseera CN/119 leftover is 0 after RCP/4838,
-- so MASEERA itself should NOT appear here).
-- Expected columns: org_name, customer_name, return_number, net_amount,
--   credit_available_balance, cn_live_remaining, linked_invoice
-- =============================================================================

SELECT
  o.name AS org_name,
  c.customer_name,
  sr.return_number,
  sr.net_amount,
  sr.credit_available_balance,
  GREATEST(0, COALESCE(cn.credit_amount, 0) - COALESCE(cn.used_amount, 0)) AS cn_live_remaining,
  s.sale_number AS linked_invoice
FROM public.sale_returns sr
JOIN public.organizations o ON o.id = sr.organization_id
JOIN public.customers c
  ON c.id = sr.customer_id AND c.organization_id = sr.organization_id
LEFT JOIN public.credit_notes cn
  ON cn.id = sr.credit_note_id AND cn.deleted_at IS NULL
LEFT JOIN public.sales s ON s.id = sr.linked_sale_id
WHERE sr.deleted_at IS NULL
  AND LOWER(COALESCE(sr.credit_status, '')) = 'adjusted'
  AND sr.linked_sale_id IS NOT NULL
  AND GREATEST(
        COALESCE(sr.credit_available_balance, 0),
        COALESCE(cn.credit_amount, 0) - COALESCE(cn.used_amount, 0)
      ) > 0.5
ORDER BY o.name, c.customer_name, sr.return_date;
