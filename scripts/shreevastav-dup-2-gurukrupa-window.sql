-- =============================================================================
-- GURUKRUPA — every receipt created 29-30 May 2026 matching the POS payment
-- description template (Customer Payment Tab "Payment for POS/..." or POS
-- Dashboard "Payment received for POS sale...").
-- READ ONLY. Paste this entire file as ONE run. Do not click Format SQL first.
-- =============================================================================

SELECT
  ve.voucher_number,
  ve.voucher_date,
  ve.created_at,
  ve.created_at AT TIME ZONE 'Asia/Kolkata' AS created_at_ist,
  ve.total_amount,
  ve.payment_method,
  ve.reference_type,
  ve.description,
  s.sale_number,
  s.net_amount,
  s.paid_amount,
  COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0) + COALESCE(s.upi_amount, 0) AS at_sale_tender,
  c.customer_name,
  c.phone
FROM public.voucher_entries ve
LEFT JOIN public.sales s
  ON s.id = ve.reference_id
 AND s.organization_id = ve.organization_id
LEFT JOIN public.customers c
  ON c.id = s.customer_id
 AND c.organization_id = ve.organization_id
WHERE ve.organization_id = 'e8fbf0d8-182c-4364-8570-96c756b72db8'
  AND ve.deleted_at IS NULL
  AND LOWER(COALESCE(ve.voucher_type, '')) = 'receipt'
  AND ve.created_at >= TIMESTAMPTZ '2026-05-29 00:00:00+00'
  AND ve.created_at <  TIMESTAMPTZ '2026-05-31 00:00:00+00'
  AND (
    ve.description ILIKE 'Payment for POS%'
    OR ve.description ILIKE 'Payment received for POS sale%'
  )
ORDER BY ve.created_at, ve.voucher_number;
