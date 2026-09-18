-- =============================================================================
-- Live reconstruction — credit_note_adjustment receipts for those four customers
-- READ ONLY. Paste this entire file as ONE run. Do not click Format SQL first.
-- ELLA NOOR only. FIFO inputs: voucher_date / created_at / amount per invoice.
-- =============================================================================

SELECT
  c.customer_name,
  s.sale_number,
  s.sale_date AS invoice_date,
  s.sale_return_adjust,
  ve.voucher_number,
  ve.voucher_date,
  ve.created_at AS voucher_created_at,
  ve.total_amount,
  ve.description
FROM public.voucher_entries ve
JOIN public.sales s
  ON s.id = ve.reference_id AND s.organization_id = ve.organization_id
JOIN public.customers c
  ON c.id = s.customer_id AND c.organization_id = s.organization_id
WHERE ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
  AND ve.deleted_at IS NULL
  AND s.deleted_at IS NULL
  AND c.deleted_at IS NULL
  AND ve.voucher_type = 'receipt'
  AND ve.payment_method = 'credit_note_adjustment'
  AND (
    c.customer_name ILIKE 'MASEERA'
    OR c.customer_name ILIKE 'DR.SADAF GODIL'
    OR c.customer_name ILIKE 'AMRIN BAIG'
    OR c.customer_name ILIKE 'Shaista Arif Reshmawala'
  )
ORDER BY c.customer_name, ve.voucher_date, ve.created_at;
