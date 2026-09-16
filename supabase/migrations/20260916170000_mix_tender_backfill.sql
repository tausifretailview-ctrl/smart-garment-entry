-- Backfill zero-tender mix payment sales: infer tender split from linked receipt
-- vouchers where possible, then assign any remaining paid gap to card_amount
-- (matches POS Dashboard / cashier report gap-fill convention).
--
-- Dry-run (review before apply):
--   SELECT * FROM mix_tender_backfill_candidates ORDER BY organization_id, sale_number;
--
-- Only updates cash_amount / card_amount / upi_amount — paid_amount is untouched.

WITH mix_tender_backfill_candidates AS (
  SELECT
    s.id,
    s.organization_id,
    s.sale_number,
    s.net_amount,
    s.paid_amount,
    COALESCE(s.cash_amount, 0)::numeric(14, 2) AS old_cash,
    COALESCE(s.card_amount, 0)::numeric(14, 2) AS old_card,
    COALESCE(s.upi_amount, 0)::numeric(14, 2) AS old_upi,
    LEAST(
      COALESCE(s.paid_amount, 0),
      COALESCE(s.net_amount, 0)
    )::numeric(14, 2) AS cap_paid
  FROM public.sales s
  WHERE s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND s.payment_method = 'multiple'
    AND COALESCE(s.paid_amount, 0) > 0.01
    AND ABS(
      COALESCE(s.cash_amount, 0)
      + COALESCE(s.card_amount, 0)
      + COALESCE(s.upi_amount, 0)
    ) < 0.01
    AND COALESCE(s.notes, '') NOT LIKE '%[mix_tender_backfill_20260916]%'
),
receipt_settlement AS (
  SELECT
    v.reference_id AS sale_id,
    SUM(
      CASE
        WHEN LOWER(COALESCE(v.payment_method, 'cash')) = 'upi'
          THEN COALESCE(v.total_amount, 0) + COALESCE(v.discount_amount, 0)
        ELSE 0
      END
    )::numeric(14, 2) AS rcp_upi,
    SUM(
      CASE
        WHEN LOWER(COALESCE(v.payment_method, 'cash')) IN (
          'card', 'cheque', 'bank_transfer', 'bank', 'finance'
        )
          THEN COALESCE(v.total_amount, 0) + COALESCE(v.discount_amount, 0)
        ELSE 0
      END
    )::numeric(14, 2) AS rcp_card,
    SUM(
      CASE
        WHEN LOWER(COALESCE(v.payment_method, 'cash')) NOT IN (
          'upi', 'card', 'cheque', 'bank_transfer', 'bank', 'finance'
        )
        AND LOWER(COALESCE(v.payment_method, 'cash')) NOT IN (
          'advance_adjustment', 'credit_note', 'advance'
        )
          THEN COALESCE(v.total_amount, 0) + COALESCE(v.discount_amount, 0)
        ELSE 0
      END
    )::numeric(14, 2) AS rcp_cash
  FROM public.voucher_entries v
  INNER JOIN mix_tender_backfill_candidates c ON c.id = v.reference_id
  WHERE v.deleted_at IS NULL
    AND v.voucher_type = 'receipt'
    AND LOWER(COALESCE(v.reference_type, '')) IN (
      'sale', 'customer', 'customer_payment', 'customerreceipt'
    )
  GROUP BY v.reference_id
),
merged AS (
  SELECT
    c.*,
    COALESCE(rs.rcp_cash, 0) AS rcp_cash,
    COALESCE(rs.rcp_card, 0) AS rcp_card,
    COALESCE(rs.rcp_upi, 0) AS rcp_upi
  FROM mix_tender_backfill_candidates c
  LEFT JOIN receipt_settlement rs ON rs.sale_id = c.id
),
computed AS (
  SELECT
    m.*,
    GREATEST(
      0,
      m.cap_paid - (m.rcp_cash + m.rcp_card + m.rcp_upi)
    )::numeric(14, 2) AS gap_to_card
  FROM merged m
),
backfill AS (
  SELECT
    id,
    rcp_cash::numeric(14, 2) AS new_cash,
    (rcp_card + gap_to_card)::numeric(14, 2) AS new_card,
    rcp_upi::numeric(14, 2) AS new_upi
  FROM computed
  WHERE ABS(old_cash - rcp_cash) > 0.009
     OR ABS(old_card - (rcp_card + gap_to_card)) > 0.009
     OR ABS(old_upi - rcp_upi) > 0.009
)
UPDATE public.sales s
SET
  cash_amount = b.new_cash,
  card_amount = b.new_card,
  upi_amount = b.new_upi,
  notes = TRIM(BOTH FROM CONCAT(
    COALESCE(s.notes, ''),
    CASE WHEN COALESCE(s.notes, '') = '' THEN '' ELSE ' ' END,
    '[mix_tender_backfill_20260916]'
  ))
FROM backfill b
WHERE s.id = b.id;
