-- Phase 0 capture — POS Dashboard dual-write historical repair predicate
-- READ-ONLY until human sign-off. Do NOT run UPDATE/DELETE from this file as-is.
--
-- Dual-write signature:
--   sales.cash|card|upi (tenders) inflated by a later balance collect that ALSO
--   inserted voucher_entries receipt with reference_type='sale'.
-- Detect when tenders + sale-linked cash receipts exceed net_amount (overlap).
--
-- Example bill (do not repair yet): POS/26-27/1248 — expect overstated_rupees ≈ 4400.

-- ---------------------------------------------------------------------------
-- A) Candidate bills (org-wide or filter organization_id)
-- ---------------------------------------------------------------------------
WITH sale_cash_receipts AS (
  SELECT
    ve.organization_id,
    ve.reference_id AS sale_id,
    ve.id AS voucher_id,
    ve.voucher_number,
    ve.voucher_date,
    ve.payment_method,
    COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0) AS receipt_settlement
  FROM public.voucher_entries ve
  WHERE ve.voucher_type = 'receipt'
    AND ve.deleted_at IS NULL
    AND lower(ve.reference_type) = 'sale'
    AND lower(COALESCE(ve.payment_method, '')) NOT IN (
      'credit_note_adjustment',
      'advance_adjustment'
    )
),
rolled AS (
  SELECT
    s.organization_id,
    s.id AS sale_id,
    s.sale_number,
    s.sale_date::date AS sale_day,
    s.net_amount,
    s.paid_amount,
    s.legacy_paid_baseline,
    COALESCE(s.cash_amount, 0) AS cash_amount,
    COALESCE(s.card_amount, 0) AS card_amount,
    COALESCE(s.upi_amount, 0) AS upi_amount,
    COALESCE(s.cash_amount, 0)
      + COALESCE(s.card_amount, 0)
      + COALESCE(s.upi_amount, 0) AS tender_total,
    COALESCE(SUM(r.receipt_settlement), 0) AS receipt_total,
    COUNT(r.voucher_id) AS receipt_count
  FROM public.sales s
  JOIN sale_cash_receipts r
    ON r.sale_id = s.id
   AND r.organization_id = s.organization_id
  WHERE s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
  GROUP BY
    s.organization_id, s.id, s.sale_number, s.sale_date, s.net_amount,
    s.paid_amount, s.legacy_paid_baseline, s.cash_amount, s.card_amount, s.upi_amount
)
SELECT
  organization_id,
  sale_id,
  sale_number,
  sale_day,
  net_amount,
  tender_total,
  receipt_total,
  tender_total + receipt_total AS tender_plus_receipts,
  GREATEST(0, tender_total + receipt_total - net_amount) AS overstated_overlap,
  -- Suggested repair direction (NOT applied): reduce tenders by overlap,
  -- prefer cash_amount first, then card, then upi — only with sign-off.
  paid_amount,
  legacy_paid_baseline,
  receipt_count
FROM rolled
WHERE tender_total > 0
  AND receipt_total > 0
  AND tender_total + receipt_total > net_amount + 0.5
ORDER BY overstated_overlap DESC, sale_day DESC;

-- ---------------------------------------------------------------------------
-- B) Scale: days / bills / rupees (same-day receipt vs sale_date — cashier day)
-- ---------------------------------------------------------------------------
-- WITH ... (reuse rolled) then:
-- SELECT COUNT(DISTINCT (organization_id, sale_day)) AS days,
--        COUNT(*) AS bills,
--        SUM(overstated_overlap) AS rupees_overstated
-- FROM (...same WHERE as above...);

-- ---------------------------------------------------------------------------
-- C) Single bill check — POS/26-27/1248
-- ---------------------------------------------------------------------------
-- SELECT s.*, r.*
-- FROM sales s
-- LEFT JOIN voucher_entries r
--   ON r.reference_id = s.id AND r.deleted_at IS NULL AND r.voucher_type = 'receipt'
-- WHERE s.sale_number = 'POS/26-27/1248' AND s.deleted_at IS NULL;
