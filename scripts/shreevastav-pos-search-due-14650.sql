-- =============================================================================
-- SHREEVASTAV POS search Due ₹14,650 — SQL-editor safe (no JWT).
-- READ ONLY. Paste as ONE run. Do not click Format SQL. Do not mutate money.
-- Org: GURUKRUPA e8fbf0d8-182c-4364-8570-96c756b72db8
--
-- Do NOT call per-customer get_customer_financial_snapshot — live function
-- still hits assert_org_member → 42501 Authentication required in SQL editor.
-- Same trap as get_customer_true_outstanding. Use snapshot_all (NULL auth.role
-- passes) + table SELECTs.
-- =============================================================================

-- S2 first (tables only) — invoice leftover family / Select Invoices
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

-- S3. SNAP paid_at_sale_drift per bill (tender − sale receipts). 824 should be 0.
SELECT
  sl.sale_number,
  COALESCE(sl.cash_amount, 0) + COALESCE(sl.card_amount, 0) + COALESCE(sl.upi_amount, 0) AS tender,
  COALESCE(rcpt.receipt_sum, 0) AS sale_receipts,
  GREATEST(
    0::numeric,
    COALESCE(sl.cash_amount, 0) + COALESCE(sl.card_amount, 0) + COALESCE(sl.upi_amount, 0)
    - COALESCE(rcpt.receipt_sum, 0)
  ) AS snap_paid_at_sale_drift
FROM public.customers c
JOIN public.sales sl
  ON sl.customer_id = c.id
 AND sl.organization_id = c.organization_id
 AND sl.deleted_at IS NULL
 AND COALESCE(sl.is_cancelled, false) = false
LEFT JOIN LATERAL (
  SELECT SUM(COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)) AS receipt_sum
  FROM public.voucher_entries ve
  WHERE ve.organization_id = sl.organization_id
    AND ve.deleted_at IS NULL
    AND LOWER(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.reference_id = sl.id
) rcpt ON TRUE
WHERE c.organization_id = 'e8fbf0d8-182c-4364-8570-96c756b72db8'
  AND c.deleted_at IS NULL
  AND c.phone LIKE '%9819151882%'
  AND (
    COALESCE(sl.cash_amount, 0) + COALESCE(sl.card_amount, 0) + COALESCE(sl.upi_amount, 0)
  ) > 0.005
ORDER BY sl.sale_date, sl.sale_number;

-- S1. C-SNAP via org-wide snapshot_all (SQL-editor safe). Filter to SHREEVASTAV.
--     Expect gross_outstanding_dr ≈ 14650 (POS search Due).
SELECT
  c.customer_name,
  s.outstanding_dr,
  s.gross_outstanding_dr,
  s.advance_available,
  s.net_position
FROM public.get_customer_financial_snapshot_all(
  'e8fbf0d8-182c-4364-8570-96c756b72db8'::uuid
) s
JOIN public.customers c
  ON c.id = s.customer_id
 AND c.organization_id = 'e8fbf0d8-182c-4364-8570-96c756b72db8'
 AND c.deleted_at IS NULL
WHERE c.phone LIKE '%9819151882%';
