-- =============================================================================
-- Live reconstruction — sale-return rows for MASEERA + 3a undercount group
-- READ ONLY. Paste this entire file as ONE run. Do not click Format SQL first.
-- ELLA NOOR only.
-- Expected: one row per SR with net_amount, credit_status, linked invoice, CN live remaining.
-- =============================================================================

SELECT
  c.customer_name,
  sr.return_number,
  sr.return_date,
  sr.created_at,
  sr.net_amount,
  sr.credit_status,
  sr.credit_available_balance,
  GREATEST(0, COALESCE(cn.credit_amount, 0) - COALESCE(cn.used_amount, 0)) AS cn_live_remaining,
  cn.credit_note_number,
  cn.credit_amount,
  cn.used_amount,
  s.sale_number AS linked_invoice,
  s.sale_date AS linked_invoice_date,
  s.sale_return_adjust AS linked_sra
FROM public.sale_returns sr
JOIN public.customers c
  ON c.id = sr.customer_id AND c.organization_id = sr.organization_id
LEFT JOIN public.credit_notes cn
  ON cn.id = sr.credit_note_id AND cn.deleted_at IS NULL
LEFT JOIN public.sales s
  ON s.id = sr.linked_sale_id AND s.organization_id = sr.organization_id
WHERE sr.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
  AND sr.deleted_at IS NULL
  AND c.deleted_at IS NULL
  AND (
    c.customer_name ILIKE 'MASEERA'
    OR c.customer_name ILIKE 'DR.SADAF GODIL'
    OR c.customer_name ILIKE 'AMRIN BAIG'
    OR c.customer_name ILIKE 'Shaista Arif Reshmawala'
  )
ORDER BY c.customer_name, sr.return_date, sr.created_at;
