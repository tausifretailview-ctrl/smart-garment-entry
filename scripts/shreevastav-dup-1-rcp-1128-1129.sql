-- =============================================================================
-- SHREEVASTAV — exact RCP/26-27/1128 and RCP/26-27/1129
-- READ ONLY. Paste this entire file as ONE run. Do not click Format SQL first.
-- Org: GURUKRUPA SILK SAREES e8fbf0d8-182c-4364-8570-96c756b72db8
-- Expected: two rows. Confirm created_at (UTC), description, reference_type,
-- reference_id, linked sale_number, amounts 2100 and 1000.
-- =============================================================================

SELECT
  ve.voucher_number,
  ve.voucher_date,
  ve.created_at,
  ve.created_at AT TIME ZONE 'Asia/Kolkata' AS created_at_ist,
  ve.total_amount,
  ve.discount_amount,
  ve.payment_method,
  ve.reference_type,
  ve.reference_id,
  ve.description,
  ve.deleted_at,
  s.sale_number,
  s.sale_date,
  s.net_amount,
  s.paid_amount,
  s.cash_amount,
  s.card_amount,
  s.upi_amount,
  s.sale_return_adjust,
  s.payment_status,
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
  AND ve.voucher_number IN ('RCP/26-27/1128', 'RCP/26-27/1129')
ORDER BY ve.voucher_number;
