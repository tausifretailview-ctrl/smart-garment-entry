-- =============================================================================
-- SHREEVASTAV POS search Due ₹14,650 — tables only (SQL editor, no JWT).
-- READ ONLY. CLICK CLEAR FIRST, then paste this whole file. Do not click Format SQL.
-- Do not mutate money. Do not reverse RCP/1128 or RCP/1129.
-- Org: GURUKRUPA e8fbf0d8-182c-4364-8570-96c756b72db8  phone 9819151882
--
-- ZERO RPCs. Do not call get_customer_financial_snapshot / _batch / _all
-- or get_customer_true_outstanding — those hit assert_org_member → 42501.
-- If your editor still shows ORDER BY on line 44, you pasted the old file.
--
-- Last grid = reconstructed C-SNAP signed (POS search Due). Expect ≈ 14650.
-- If the editor only shows one grid, select S2 or S3 and Run that block.
-- =============================================================================

-- S2 first (tables) — invoice leftover family / Select Invoices (POS/1903 ≈ 16250)
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

-- S3. SNAP paid_at_sale_drift per bill (tender − sale receipts). POS/824 should be 0.
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
 AND lower(COALESCE(sl.payment_status, '')) NOT IN ('cancelled', 'hold')
LEFT JOIN LATERAL (
  SELECT SUM(
    GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
  ) AS receipt_sum
  FROM public.voucher_entries ve
  WHERE ve.organization_id = sl.organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.reference_id::text = sl.id::text
) rcpt ON TRUE
WHERE c.organization_id = 'e8fbf0d8-182c-4364-8570-96c756b72db8'
  AND c.deleted_at IS NULL
  AND c.phone LIKE '%9819151882%'
  AND (
    COALESCE(sl.cash_amount, 0) + COALESCE(sl.card_amount, 0) + COALESCE(sl.upi_amount, 0)
  ) > 0.005
ORDER BY sl.sale_date, sl.sale_number;

-- S1. Reconstruct C-SNAP signed from tables (same components as true_outstanding).
--     POS search Due = grossOutstandingDr = signed + unused advance.
--     SHREEVASTAV unused advance is ₹0, so signed ≈ gross ≈ 14650.
WITH cust AS (
  SELECT
    c.id,
    c.customer_name,
    c.organization_id,
    COALESCE(c.opening_balance, 0)::numeric AS opening_balance
  FROM public.customers c
  WHERE c.organization_id = 'e8fbf0d8-182c-4364-8570-96c756b72db8'
    AND c.deleted_at IS NULL
    AND c.phone LIKE '%9819151882%'
),
valid_sales AS (
  SELECT sl.*
  FROM cust
  JOIN public.sales sl
    ON sl.customer_id = cust.id
   AND sl.organization_id = cust.organization_id
   AND sl.deleted_at IS NULL
   AND COALESCE(sl.is_cancelled, false) = false
   AND lower(COALESCE(sl.payment_status, '')) NOT IN ('cancelled', 'hold')
),
items_gross AS (
  SELECT
    si.sale_id,
    SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0))::numeric AS gross
  FROM public.sale_items si
  JOIN valid_sales sl ON sl.id = si.sale_id
  WHERE si.deleted_at IS NULL
  GROUP BY si.sale_id
),
balance_adjustment AS (
  SELECT COALESCE(SUM(cba.outstanding_difference), 0)::numeric AS amt
  FROM cust
  JOIN public.customer_balance_adjustments cba
    ON cba.customer_id = cust.id
   AND cba.organization_id = cust.organization_id
),
total_invoiced AS (
  SELECT COALESCE(SUM(sl.net_amount), 0)::numeric AS amt
  FROM valid_sales sl
),
sale_return_adjust AS (
  SELECT COALESCE(SUM(
    CASE
      WHEN COALESCE(ig.gross, 0) > 0
           AND COALESCE(sl.sale_return_adjust, 0) > 0
           AND sl.net_amount + COALESCE(sl.sale_return_adjust, 0) <= ig.gross + 1
      THEN 0
      ELSE COALESCE(sl.sale_return_adjust, 0)
    END
  ), 0)::numeric AS amt
  FROM valid_sales sl
  LEFT JOIN items_gross ig ON ig.sale_id = sl.id
),
receipt_payments AS (
  SELECT COALESCE(SUM(u.amt), 0)::numeric AS amt
  FROM (
    SELECT GREATEST(
      0::numeric,
      COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)
    )::numeric AS amt
    FROM cust
    JOIN public.voucher_entries ve
      ON ve.organization_id = cust.organization_id
    JOIN valid_sales sl
      ON sl.id::text = ve.reference_id::text
    WHERE ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
      AND NOT (
        lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
      )
    UNION ALL
    SELECT GREATEST(
      0::numeric,
      COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)
    )::numeric AS amt
    FROM cust
    JOIN public.voucher_entries ve
      ON ve.organization_id = cust.organization_id
     AND trim(COALESCE(ve.reference_id::text, '')) = trim(cust.id::text)
    WHERE ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
      AND lower(COALESCE(ve.reference_type, '')) = 'customer'
      AND NOT (
        lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.sales s2 WHERE s2.id::text = ve.reference_id::text
      )
  ) u
),
paid_at_sale_drift AS (
  SELECT COALESCE(SUM(sub.drift), 0)::numeric AS amt
  FROM (
    SELECT GREATEST(
      0::numeric,
      GREATEST(COALESCE(sl.cash_amount, 0), 0)
        + GREATEST(COALESCE(sl.card_amount, 0), 0)
        + GREATEST(COALESCE(sl.upi_amount, 0), 0)
      - COALESCE((
        SELECT SUM(
          GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
        )
        FROM public.voucher_entries ve
        WHERE ve.organization_id = sl.organization_id
          AND ve.deleted_at IS NULL
          AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
          AND ve.reference_id::text = sl.id::text
      ), 0)
    )::numeric AS drift
    FROM valid_sales sl
    WHERE (
      GREATEST(COALESCE(sl.cash_amount, 0), 0)
      + GREATEST(COALESCE(sl.card_amount, 0), 0)
      + GREATEST(COALESCE(sl.upi_amount, 0), 0)
    ) > 0.005
  ) sub
  WHERE sub.drift > 0
),
pending_sale_returns AS (
  SELECT COALESCE(SUM(
    GREATEST(
      0::numeric,
      COALESCE(sr.net_amount, 0) - COALESCE(ls.sale_return_adjust, 0)
    )
  ), 0)::numeric AS amt
  FROM cust
  JOIN public.sale_returns sr
    ON sr.customer_id = cust.id
   AND sr.organization_id = cust.organization_id
  LEFT JOIN public.sales ls
    ON ls.id = sr.linked_sale_id
   AND ls.organization_id = cust.organization_id
   AND ls.deleted_at IS NULL
  WHERE sr.deleted_at IS NULL
    AND lower(trim(COALESCE(sr.credit_status, ''))) = 'pending'
),
credit_note_vouchers AS (
  SELECT COALESCE(SUM(
    GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
  ), 0)::numeric AS amt
  FROM cust
  JOIN public.voucher_entries ve
    ON ve.organization_id = cust.organization_id
   AND trim(COALESCE(ve.reference_id::text, '')) = trim(cust.id::text)
  WHERE ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'credit_note'
    AND lower(COALESCE(ve.reference_type, '')) = 'customer'
),
customer_payment_refunds AS (
  SELECT COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0))), 0)::numeric AS amt
  FROM cust
  JOIN public.voucher_entries ve
    ON ve.organization_id = cust.organization_id
   AND trim(COALESCE(ve.reference_id::text, '')) = trim(cust.id::text)
  WHERE ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'payment'
    AND lower(COALESCE(ve.reference_type, '')) = 'customer'
),
customer_advance_totals AS (
  SELECT
    COALESCE(SUM(ca.amount), 0)::numeric AS total_amount,
    COALESCE(SUM(ca.used_amount), 0)::numeric AS total_used
  FROM cust
  JOIN public.customer_advances ca
    ON ca.customer_id = cust.id
   AND ca.organization_id = cust.organization_id
),
customer_advance_refunds AS (
  SELECT COALESCE(SUM(ar.refund_amount), 0)::numeric AS total_refunds
  FROM cust
  JOIN public.customer_advances ca
    ON ca.customer_id = cust.id
   AND ca.organization_id = cust.organization_id
  JOIN public.advance_refunds ar ON ar.advance_id = ca.id
)
SELECT
  cust.customer_name,
  cust.opening_balance,
  ba.amt AS balance_adjustment,
  ti.amt AS total_invoiced,
  sra.amt AS sale_return_adjust,
  rp.amt AS receipt_payments,
  psd.amt AS paid_at_sale_drift,
  psr.amt AS pending_sale_returns,
  cnv.amt AS credit_note_vouchers,
  cpr.amt AS customer_payment_refunds,
  cat.total_used AS advances_applied,
  GREATEST(
    0::numeric,
    cat.total_amount - cat.total_used - car.total_refunds
  ) AS unused_advances,
  (
    cust.opening_balance
    + ba.amt
    + ti.amt
    - sra.amt
    - rp.amt
    - psd.amt
    - psr.amt
    - cnv.amt
    - cpr.amt
    - cat.total_used
    - GREATEST(0::numeric, cat.total_amount - cat.total_used - car.total_refunds)
  )::numeric AS reconstructed_snap_signed,
  (
    cust.opening_balance
    + ba.amt
    + ti.amt
    - sra.amt
    - rp.amt
    - psd.amt
    - psr.amt
    - cnv.amt
    - cpr.amt
    - cat.total_used
  )::numeric AS reconstructed_gross_outstanding_dr
FROM cust
CROSS JOIN balance_adjustment ba
CROSS JOIN total_invoiced ti
CROSS JOIN sale_return_adjust sra
CROSS JOIN receipt_payments rp
CROSS JOIN paid_at_sale_drift psd
CROSS JOIN pending_sale_returns psr
CROSS JOIN credit_note_vouchers cnv
CROSS JOIN customer_payment_refunds cpr
CROSS JOIN customer_advance_totals cat
CROSS JOIN customer_advance_refunds car;
