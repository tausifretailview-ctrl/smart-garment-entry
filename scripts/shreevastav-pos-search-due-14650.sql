-- =============================================================================
-- SHREEVASTAV POS search Due ₹14,650 — C-SNAP vs C-JS vs this-bill leftover.
-- READ ONLY. Paste as ONE run. Do not Format SQL. Do not mutate money.
-- Org: GURUKRUPA e8fbf0d8-182c-4364-8570-96c756b72db8
-- =============================================================================

-- S1. C-SNAP (same RPC as POS search dropdown)
SELECT
  c.customer_name,
  s.outstanding_dr,
  s.gross_outstanding_dr,
  s.advance_available,
  s.net_position
FROM public.customers c
CROSS JOIN LATERAL public.get_customer_financial_snapshot(c.id, c.organization_id) s
WHERE c.organization_id = 'e8fbf0d8-182c-4364-8570-96c756b72db8'
  AND c.deleted_at IS NULL
  AND c.phone LIKE '%9819151882%';

-- S2. Open invoices: net, tender, paid_amount, leftover (Select Invoices family)
SELECT
  sl.sale_number,
  sl.net_amount,
  COALESCE(sl.cash_amount, 0) + COALESCE(sl.card_amount, 0) + COALESCE(sl.upi_amount, 0) AS at_sale_tender,
  sl.paid_amount,
  sl.payment_status,
  GREATEST(
    COALESCE(sl.net_amount, 0) - COALESCE(sl.sale_return_adjust, 0)
    - GREATEST(
        COALESCE(sl.cash_amount, 0) + COALESCE(sl.card_amount, 0) + COALESCE(sl.upi_amount, 0),
        COALESCE(sl.paid_amount, 0)
      ),
    0
  ) AS naive_leftover
FROM public.customers c
JOIN public.sales sl
  ON sl.customer_id = c.id
 AND sl.organization_id = c.organization_id
 AND sl.deleted_at IS NULL
 AND COALESCE(sl.is_cancelled, false) = false
WHERE c.organization_id = 'e8fbf0d8-182c-4364-8570-96c756b72db8'
  AND c.deleted_at IS NULL
  AND c.phone LIKE '%9819151882%'
ORDER BY sl.sale_date, sl.sale_number;
