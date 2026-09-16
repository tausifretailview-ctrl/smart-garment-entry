-- Dry-run for mix_tender_backfill migration.
-- Run in Supabase SQL editor (service role / platform admin) BEFORE applying migration.
-- Shows candidate count by org, then 5 sample rows with before/after tender columns.

WITH mix_tender_backfill_candidates AS (
  SELECT
    s.id,
    s.organization_id,
    o.name AS org_name,
    s.sale_number,
    s.sale_type,
    s.sale_date,
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
  LEFT JOIN public.organizations o ON o.id = s.organization_id
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
)
SELECT
  organization_id,
  org_name,
  COUNT(*)::int AS candidate_count
FROM computed
GROUP BY 1, 2
ORDER BY candidate_count DESC
LIMIT 20;

-- Five-row hand-check (one row per org where possible):
WITH mix_tender_backfill_candidates AS (
  SELECT
    s.id,
    s.organization_id,
    o.name AS org_name,
    s.sale_number,
    s.sale_type,
    s.sale_date,
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
  LEFT JOIN public.organizations o ON o.id = s.organization_id
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
    )::numeric(14, 2) AS gap_to_card,
    ROW_NUMBER() OVER (
      PARTITION BY m.organization_id
      ORDER BY m.sale_date DESC, m.sale_number DESC
    ) AS rn_org
  FROM merged m
),
backfill AS (
  SELECT
    *,
    rcp_cash AS new_cash,
    (rcp_card + gap_to_card)::numeric(14, 2) AS new_card,
    rcp_upi AS new_upi
  FROM computed
)
SELECT
  org_name,
  sale_number,
  sale_date,
  net_amount,
  paid_amount,
  old_cash,
  old_card,
  old_upi,
  rcp_cash,
  rcp_card,
  rcp_upi,
  gap_to_card,
  new_cash,
  new_card,
  new_upi,
  (new_cash + new_card + new_upi) AS new_tender_sum,
  paid_amount AS paid_unchanged
FROM backfill
WHERE rn_org = 1
ORDER BY org_name
LIMIT 5;
