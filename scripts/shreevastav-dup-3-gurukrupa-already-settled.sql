-- =============================================================================
-- GURUKRUPA — 29-30 May POS-template receipts against an invoice that already
-- had zero remaining (prior receipts + residual at-sale tender >= net - SRA)
-- BEFORE this voucher landed. The SHREEVASTAV duplicate signature.
-- READ ONLY. Paste this entire file as ONE run. Do not click Format SQL first.
-- remaining_before <= 0.5 is the match. RCP/1127 on POS/767 should NOT match.
-- =============================================================================

SELECT
  ve.voucher_number,
  ve.created_at,
  ve.created_at AT TIME ZONE 'Asia/Kolkata' AS created_at_ist,
  ve.total_amount,
  ve.reference_type,
  ve.description,
  s.sale_number,
  s.net_amount,
  s.sale_return_adjust,
  COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0) + COALESCE(s.upi_amount, 0) AS at_sale_tender,
  COALESCE(prior.receipt_sum, 0) AS prior_receipts,
  COALESCE(same_day.receipt_sum, 0) AS same_day_prior_receipts,
  GREATEST(
    COALESCE(s.net_amount, 0) - COALESCE(s.sale_return_adjust, 0)
    - COALESCE(prior.receipt_sum, 0)
    - GREATEST(
        COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0) + COALESCE(s.upi_amount, 0)
        - COALESCE(same_day.receipt_sum, 0),
        0
      ),
    0
  ) AS remaining_before,
  c.customer_name,
  c.phone
FROM public.voucher_entries ve
JOIN public.sales s
  ON s.id = ve.reference_id
 AND s.organization_id = ve.organization_id
 AND s.deleted_at IS NULL
LEFT JOIN public.customers c
  ON c.id = s.customer_id
 AND c.organization_id = s.organization_id
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
WHERE ve.organization_id = 'e8fbf0d8-182c-4364-8570-96c756b72db8'
  AND ve.deleted_at IS NULL
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
ORDER BY ve.created_at, ve.voucher_number;
