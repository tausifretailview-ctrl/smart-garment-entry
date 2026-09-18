-- =============================================================================
-- All orgs — headline of 29-30 May already-zero-balance POS-template receipts.
-- READ ONLY. Paste this entire file as ONE run. Do not click Format SQL first.
-- =============================================================================

SELECT
  o.name AS org_name,
  ve.organization_id,
  COUNT(*) AS duplicate_receipt_rows,
  COUNT(DISTINCT s.customer_id) AS customer_count,
  COUNT(DISTINCT s.id) AS invoice_count,
  SUM(ve.total_amount) AS duplicate_amount_sum
FROM public.voucher_entries ve
JOIN public.organizations o ON o.id = ve.organization_id
JOIN public.sales s
  ON s.id = ve.reference_id
 AND s.organization_id = ve.organization_id
 AND s.deleted_at IS NULL
LEFT JOIN LATERAL (
  SELECT SUM(COALESCE(p.total_amount, 0) + COALESCE(p.discount_amount, 0)) AS receipt_sum
  FROM public.voucher_entries p
  WHERE p.organization_id = ve.organization_id
    AND p.reference_id = ve.reference_id
    AND p.deleted_at IS NULL
    AND LOWER(COALESCE(p.voucher_type, '')) = 'receipt'
    AND COALESCE(p.payment_method, '') IS DISTINCT FROM 'credit_note_adjustment'
    AND p.created_at < ve.created_at
) prior ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(COALESCE(p.total_amount, 0) + COALESCE(p.discount_amount, 0)) AS receipt_sum
  FROM public.voucher_entries p
  WHERE p.organization_id = ve.organization_id
    AND p.reference_id = ve.reference_id
    AND p.deleted_at IS NULL
    AND LOWER(COALESCE(p.voucher_type, '')) = 'receipt'
    AND COALESCE(p.payment_method, '') IS DISTINCT FROM 'credit_note_adjustment'
    AND p.created_at < ve.created_at
    AND p.voucher_date IS NOT DISTINCT FROM (s.sale_date AT TIME ZONE 'Asia/Kolkata')::date
) same_day ON TRUE
WHERE ve.deleted_at IS NULL
  AND LOWER(COALESCE(ve.voucher_type, '')) = 'receipt'
  AND ve.created_at >= TIMESTAMPTZ '2026-05-29 00:00:00+00'
  AND ve.created_at <  TIMESTAMPTZ '2026-05-31 00:00:00+00'
  AND (
    ve.description ILIKE 'Payment for POS%'
    OR ve.description ILIKE 'Payment received for POS sale%'
  )
  AND GREATEST(
    COALESCE(s.net_amount, 0) - COALESCE(s.sale_return_adjust, 0)
    - COALESCE(prior.receipt_sum, 0)
    - GREATEST(
        COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0) + COALESCE(s.upi_amount, 0)
        - COALESCE(same_day.receipt_sum, 0),
        0
      ),
    0
  ) <= 0.5
GROUP BY o.name, ve.organization_id
ORDER BY duplicate_receipt_rows DESC;
