-- =============================================================================
-- Receipt guard — Query A already pasted true/true/true (14:51 IST).
-- READ ONLY. ONE SELECT first so the first exported tab is C2.
-- Do not click Format SQL. Do not DROP the trigger. Do not mutate money.
-- =============================================================================

-- C2. SHREEVASTAV shape: cash/card/UPI already-zero since go-live (0 rows = holding)
SELECT
  o.name AS org_name,
  ve.voucher_number,
  ve.created_at,
  ve.total_amount,
  ve.payment_method,
  ve.client_request_id,
  ve.description,
  s.sale_number,
  s.net_amount,
  GREATEST(
    COALESCE(s.net_amount, 0) - COALESCE(s.sale_return_adjust, 0)
    - COALESCE(prior.receipt_sum, 0)
    - GREATEST(
        COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0) + COALESCE(s.upi_amount, 0)
        - COALESCE(same_day.receipt_sum, 0),
        0
      ),
    0
  ) AS remaining_before
FROM public.voucher_entries ve
JOIN public.sales s
  ON s.id = ve.reference_id
 AND s.organization_id = ve.organization_id
 AND s.deleted_at IS NULL
LEFT JOIN public.organizations o
  ON o.id = ve.organization_id
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
  AND ve.created_at >= TIMESTAMPTZ '2026-09-18 20:10:54+00'
  AND COALESCE(ve.payment_method, '') NOT IN ('credit_note_adjustment', 'advance_adjustment')
  AND (
    ve.description ILIKE 'Payment for %'
    OR ve.description ILIKE 'Payment received for POS sale%'
    OR ve.reference_type IN ('sale', 'SALE', 'CustomerReceipt', 'customer', 'customer_payment')
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

-- D. Same-submit key reused (expect 0 while with_submit_key is 0)
SELECT
  ve.client_request_id,
  COUNT(*) AS rows
FROM public.voucher_entries ve
WHERE ve.deleted_at IS NULL
  AND ve.client_request_id IS NOT NULL
  AND ve.created_at >= TIMESTAMPTZ '2026-09-18 20:10:54+00'
GROUP BY 1
HAVING COUNT(*) > 1
ORDER BY rows DESC;
