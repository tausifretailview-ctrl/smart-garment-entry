-- =============================================================================
-- Dashboard sales / cash formula parity — READ-ONLY verification
-- =============================================================================
-- Direct SELECTs only (no RPCs / no assert_org_member). Safe in Supabase SQL
-- editor with no auth session.
--
-- HOW TO RUN:
--   1. Edit org_id / dates in the params CTE below (single place).
--   2. Run the ENTIRE script top → bottom. Each section is a labeled SELECT
--      (column `section` first). Supabase shows one result panel per statement.
--
-- Date basis: Asia/Kolkata calendar day on sale_date / return_date.
-- =============================================================================

-- Shared params (edit once). Every section references this via a copy of the CTE
-- so each statement is self-contained and order-independent.
-- org: 184c86d6-bd6f-4441-815f-07984697d884


-- =============================================================================
-- 0) PARAMETERS
-- =============================================================================
WITH params AS (
  SELECT
    '184c86d6-bd6f-4441-815f-07984697d884'::uuid AS org_id,
    DATE '2026-07-01' AS start_date,
    DATE '2026-07-24' AS end_date
)
SELECT
  '0_params'::text AS section,
  org_id,
  start_date,
  end_date,
  (start_date::timestamp AT TIME ZONE 'Asia/Kolkata') AS range_start_tstz,
  ((end_date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') AS range_end_exclusive_tstz
FROM params;


-- =============================================================================
-- (A) Bills with net_amount < 0 — tender columns
-- =============================================================================
WITH params AS (
  SELECT
    '184c86d6-bd6f-4441-815f-07984697d884'::uuid AS org_id,
    DATE '2026-07-01' AS start_date,
    DATE '2026-07-24' AS end_date
)
SELECT
  'A_negative_net_bills'::text AS section,
  s.id,
  s.sale_number,
  s.sale_type,
  s.payment_status,
  s.payment_method,
  s.is_cancelled,
  (timezone('Asia/Kolkata', s.sale_date))::date AS sale_day_ist,
  s.gross_amount,
  s.discount_amount,
  s.flat_discount_amount,
  s.points_redeemed_amount,
  s.round_off,
  s.sale_return_adjust,
  s.net_amount,
  s.paid_amount,
  s.cash_amount,
  s.card_amount,
  s.upi_amount,
  s.refund_amount,
  ROUND(
    COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0) + COALESCE(s.upi_amount, 0),
    2
  ) AS tender_sum
FROM public.sales s
CROSS JOIN params p
WHERE s.organization_id = p.org_id
  AND s.deleted_at IS NULL
  AND (timezone('Asia/Kolkata', s.sale_date))::date BETWEEN p.start_date AND p.end_date
  AND COALESCE(s.net_amount, 0) < 0
ORDER BY s.sale_date, s.sale_number;


-- =============================================================================
-- (B1) delivery_challan bills in range
-- =============================================================================
WITH params AS (
  SELECT
    '184c86d6-bd6f-4441-815f-07984697d884'::uuid AS org_id,
    DATE '2026-07-01' AS start_date,
    DATE '2026-07-24' AS end_date
)
SELECT
  'B1_delivery_challan_bills'::text AS section,
  s.id,
  s.sale_number,
  s.payment_status,
  s.payment_method,
  s.is_cancelled,
  (timezone('Asia/Kolkata', s.sale_date))::date AS sale_day_ist,
  s.gross_amount,
  s.net_amount,
  s.paid_amount,
  s.cash_amount,
  s.card_amount,
  s.upi_amount,
  s.sale_return_adjust,
  s.refund_amount
FROM public.sales s
CROSS JOIN params p
WHERE s.organization_id = p.org_id
  AND s.deleted_at IS NULL
  AND s.sale_type = 'delivery_challan'
  AND (timezone('Asia/Kolkata', s.sale_date))::date BETWEEN p.start_date AND p.end_date
ORDER BY s.sale_date, s.sale_number;


-- =============================================================================
-- (B2) DC rollup + view definition (no sale_type filter ⇒ DC is in Main Total Sales)
-- =============================================================================
WITH params AS (
  SELECT
    '184c86d6-bd6f-4441-815f-07984697d884'::uuid AS org_id,
    DATE '2026-07-01' AS start_date,
    DATE '2026-07-24' AS end_date
),
dc AS (
  SELECT
    COUNT(*)::int AS dc_bill_count,
    ROUND(COALESCE(SUM(s.net_amount), 0), 2) AS dc_net_total,
    ROUND(COALESCE(SUM(s.gross_amount), 0), 2) AS dc_gross_total
  FROM public.sales s
  CROSS JOIN params p
  WHERE s.organization_id = p.org_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND s.sale_type = 'delivery_challan'
    AND (timezone('Asia/Kolkata', s.sale_date))::date BETWEEN p.start_date AND p.end_date
)
SELECT
  'B2_dc_inclusion_and_view_def'::text AS section,
  d.dc_bill_count,
  d.dc_net_total,
  d.dc_gross_total,
  (pg_get_viewdef('public.v_dashboard_sales_summary'::regclass, true) ILIKE '%sale_type%')
    AS view_filters_sale_type,
  (pg_get_viewdef('public.v_dashboard_sales_summary'::regclass, true) ILIKE '%delivery_challan%')
    AS view_mentions_delivery_challan,
  pg_get_viewdef('public.v_dashboard_sales_summary'::regclass, true) AS view_definition
FROM dc d;


-- =============================================================================
-- (C) sale_returns in range grouped by refund_type (+ ALL = Main S/R Amount)
-- =============================================================================
WITH params AS (
  SELECT
    '184c86d6-bd6f-4441-815f-07984697d884'::uuid AS org_id,
    DATE '2026-07-01' AS start_date,
    DATE '2026-07-24' AS end_date
),
by_type AS (
  SELECT
    COALESCE(sr.refund_type, '(null)') AS refund_type,
    COUNT(*)::int AS return_count,
    ROUND(COALESCE(SUM(sr.net_amount), 0), 2) AS net_total,
    ROUND(COALESCE(SUM(sr.gross_amount), 0), 2) AS gross_total
  FROM public.sale_returns sr
  CROSS JOIN params p
  WHERE sr.organization_id = p.org_id
    AND sr.deleted_at IS NULL
    AND sr.return_date BETWEEN p.start_date AND p.end_date
  GROUP BY COALESCE(sr.refund_type, '(null)')
),
all_types AS (
  SELECT
    'ALL (Main Dashboard S/R Amount)'::text AS refund_type,
    COUNT(*)::int AS return_count,
    ROUND(COALESCE(SUM(sr.net_amount), 0), 2) AS net_total,
    ROUND(COALESCE(SUM(sr.gross_amount), 0), 2) AS gross_total
  FROM public.sale_returns sr
  CROSS JOIN params p
  WHERE sr.organization_id = p.org_id
    AND sr.deleted_at IS NULL
    AND sr.return_date BETWEEN p.start_date AND p.end_date
)
SELECT 'C_refund_type_split'::text AS section, *
FROM (
  SELECT * FROM by_type
  UNION ALL
  SELECT * FROM all_types
) x
ORDER BY refund_type;


-- =============================================================================
-- (D) Double-subtract candidates:
--     sale.refund_amount > 0 AND matching cash_refund return
--     (linked_sale_id OR original_sale_number = sale_number)
-- =============================================================================
WITH params AS (
  SELECT
    '184c86d6-bd6f-4441-815f-07984697d884'::uuid AS org_id,
    DATE '2026-07-01' AS start_date,
    DATE '2026-07-24' AS end_date
)
SELECT
  'D_double_refund_candidates'::text AS section,
  s.id AS sale_id,
  s.sale_number,
  s.sale_type,
  (timezone('Asia/Kolkata', s.sale_date))::date AS sale_day_ist,
  s.net_amount,
  s.paid_amount,
  s.cash_amount,
  s.card_amount,
  s.upi_amount,
  s.refund_amount AS sale_refund_amount,
  s.sale_return_adjust,
  sr.id AS return_id,
  sr.return_number,
  sr.return_date,
  sr.refund_type,
  sr.net_amount AS return_net_amount,
  sr.linked_sale_id,
  sr.original_sale_number,
  CASE
    WHEN sr.linked_sale_id = s.id THEN 'linked_sale_id'
    WHEN sr.original_sale_number IS NOT NULL
      AND sr.original_sale_number = s.sale_number THEN 'original_sale_number'
    ELSE 'other'
  END AS match_reason
FROM public.sales s
CROSS JOIN params p
JOIN public.sale_returns sr
  ON sr.organization_id = s.organization_id
 AND sr.deleted_at IS NULL
 AND sr.refund_type = 'cash_refund'
 AND (
       sr.linked_sale_id = s.id
       OR (
         sr.original_sale_number IS NOT NULL
         AND s.sale_number IS NOT NULL
         AND sr.original_sale_number = s.sale_number
       )
     )
WHERE s.organization_id = p.org_id
  AND s.deleted_at IS NULL
  AND COALESCE(s.refund_amount, 0) > 0
  AND (timezone('Asia/Kolkata', s.sale_date))::date BETWEEN p.start_date AND p.end_date
ORDER BY s.sale_date, s.sale_number, sr.return_date;


-- =============================================================================
-- (DISTINCT) Suspicion: sum(DISTINCT net_amount) in v_dashboard_sales_summary
--   (a) full view definition
--   (b) Main Total Sales via view vs plain SUM(net_amount) — show difference
--   (c) same-day duplicate-net bill groups — amount lost to DISTINCT
-- =============================================================================

-- (DISTINCT-a) View definition
SELECT
  'DISTINCT_a_view_definition'::text AS section,
  pg_get_viewdef('public.v_dashboard_sales_summary'::regclass, true) AS view_definition;


-- (DISTINCT-b) View total vs plain SUM — same org + IST date filter
WITH params AS (
  SELECT
    '184c86d6-bd6f-4441-815f-07984697d884'::uuid AS org_id,
    DATE '2026-07-01' AS start_date,
    DATE '2026-07-24' AS end_date
),
via_view AS (
  SELECT ROUND(COALESCE(SUM(v.total_sales), 0), 2) AS main_total_via_view
  FROM public.v_dashboard_sales_summary v
  CROSS JOIN params p
  WHERE v.organization_id = p.org_id
    AND v.sale_day BETWEEN p.start_date AND p.end_date
),
via_plain AS (
  SELECT
    ROUND(COALESCE(SUM(s.net_amount), 0), 2) AS main_total_plain_sum,
    COUNT(*)::int AS invoice_count
  FROM public.sales s
  CROSS JOIN params p
  WHERE s.organization_id = p.org_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND (timezone('Asia/Kolkata', s.sale_date))::date BETWEEN p.start_date AND p.end_date
)
SELECT
  'DISTINCT_b_view_vs_plain_sum'::text AS section,
  v.main_total_via_view,
  p.main_total_plain_sum,
  ROUND(p.main_total_plain_sum - v.main_total_via_view, 2) AS difference_plain_minus_view,
  p.invoice_count,
  CASE
    WHEN ROUND(p.main_total_plain_sum - v.main_total_via_view, 2) = 0 THEN 'OK — no DISTINCT undercount'
    ELSE 'DRIFT — view undercounts (likely sum(DISTINCT net_amount))'
  END AS diagnosis
FROM via_view v
CROSS JOIN via_plain p;


-- (DISTINCT-c) Same-day duplicate net_amount groups (what DISTINCT collapses)
WITH params AS (
  SELECT
    '184c86d6-bd6f-4441-815f-07984697d884'::uuid AS org_id,
    DATE '2026-07-01' AS start_date,
    DATE '2026-07-24' AS end_date
),
filtered AS (
  SELECT
    s.id,
    s.sale_number,
    s.sale_type,
    s.net_amount,
    (timezone('Asia/Kolkata', s.sale_date))::date AS sale_day_ist
  FROM public.sales s
  CROSS JOIN params p
  WHERE s.organization_id = p.org_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND (timezone('Asia/Kolkata', s.sale_date))::date BETWEEN p.start_date AND p.end_date
),
dup_groups AS (
  SELECT
    sale_day_ist,
    net_amount,
    COUNT(*)::int AS bill_count,
    array_agg(sale_number ORDER BY sale_number) AS sale_numbers,
    array_agg(id::text ORDER BY sale_number) AS sale_ids,
    -- DISTINCT keeps one copy of net_amount; lost = (n-1) * net
    ROUND((COUNT(*) - 1) * COALESCE(net_amount, 0), 2) AS amount_lost_to_distinct
  FROM filtered
  GROUP BY sale_day_ist, net_amount
  HAVING COUNT(*) > 1
)
SELECT
  'DISTINCT_c_duplicate_net_groups'::text AS section,
  sale_day_ist,
  net_amount,
  bill_count,
  sale_numbers,
  sale_ids,
  amount_lost_to_distinct
FROM dup_groups
ORDER BY amount_lost_to_distinct DESC, sale_day_ist, net_amount;


-- (DISTINCT-c totals) Sum of amount lost across all duplicate groups
WITH params AS (
  SELECT
    '184c86d6-bd6f-4441-815f-07984697d884'::uuid AS org_id,
    DATE '2026-07-01' AS start_date,
    DATE '2026-07-24' AS end_date
),
filtered AS (
  SELECT
    s.net_amount,
    (timezone('Asia/Kolkata', s.sale_date))::date AS sale_day_ist
  FROM public.sales s
  CROSS JOIN params p
  WHERE s.organization_id = p.org_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND (timezone('Asia/Kolkata', s.sale_date))::date BETWEEN p.start_date AND p.end_date
),
dup_groups AS (
  SELECT
    sale_day_ist,
    net_amount,
    COUNT(*)::int AS bill_count,
    ROUND((COUNT(*) - 1) * COALESCE(net_amount, 0), 2) AS amount_lost_to_distinct
  FROM filtered
  GROUP BY sale_day_ist, net_amount
  HAVING COUNT(*) > 1
)
SELECT
  'DISTINCT_c_total_lost'::text AS section,
  COUNT(*)::int AS duplicate_group_count,
  ROUND(COALESCE(SUM(amount_lost_to_distinct), 0), 2) AS total_amount_lost_to_distinct
FROM dup_groups;


-- =============================================================================
-- (E) Side-by-side headline recompute — plain SQL, each dashboard's formula
-- =============================================================================
WITH params AS (
  SELECT
    '184c86d6-bd6f-4441-815f-07984697d884'::uuid AS org_id,
    DATE '2026-07-01' AS start_date,
    DATE '2026-07-24' AS end_date
),
sales_in_range AS (
  SELECT
    s.*,
    (timezone('Asia/Kolkata', s.sale_date))::date AS sale_day_ist,
    COALESCE(s.is_cancelled, false) AS cancelled,
    (
      s.payment_status = 'hold'
      OR (
        s.payment_status = 'pending'
        AND s.sale_number LIKE 'Hold/%'
        AND s.payment_method = 'pay_later'
      )
    ) AS is_hold_pos,
    (
      s.payment_status = 'hold'
      OR (
        s.payment_status = 'pending'
        AND s.sale_number LIKE 'Hold/%'
      )
    ) AS is_hold_cashier,
    CASE
      WHEN COALESCE(s.gross_amount, 0) > 0 THEN s.gross_amount
      WHEN COALESCE(s.net_amount, 0) > 0 THEN s.net_amount
      ELSE 0
    END AS report_gross,
    (
      COALESCE(s.discount_amount, 0)
      + COALESCE(s.flat_discount_amount, 0)
      + COALESCE(s.points_redeemed_amount, 0)
      - COALESCE(s.round_off, 0)
    ) AS report_discount,
    COALESCE(s.net_amount, 0) AS report_net,
    GREATEST(0, COALESCE(s.net_amount, 0)) AS pos_net_amt,
    ROUND(
      COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0) + COALESCE(s.upi_amount, 0),
      2
    ) AS tender_amt
  FROM public.sales s
  CROSS JOIN params p
  WHERE s.organization_id = p.org_id
    AND s.deleted_at IS NULL
    AND (timezone('Asia/Kolkata', s.sale_date))::date BETWEEN p.start_date AND p.end_date
),
main_sales AS (
  -- Main: not cancelled; ALL sale_types; holds INCLUDED (matches view filters)
  SELECT * FROM sales_in_range WHERE cancelled = false
),
pos_sales AS (
  SELECT * FROM sales_in_range
  WHERE cancelled = false
    AND sale_type IN ('pos', 'delivery_challan')
    AND NOT is_hold_pos
),
pos_with_paid AS (
  SELECT
    ps.*,
    CASE
      WHEN tender_amt <= 0.01 THEN LEAST(pos_net_amt, GREATEST(0, COALESCE(paid_amount, 0)))
      ELSE LEAST(pos_net_amt, GREATEST(COALESCE(paid_amount, 0), tender_amt))
    END AS effective_paid,
    GREATEST(
      0,
      GREATEST(0, COALESCE(net_amount, 0))
        - CASE
            WHEN tender_amt <= 0.01 THEN LEAST(
              GREATEST(0, COALESCE(net_amount, 0)),
              GREATEST(0, COALESCE(paid_amount, 0))
            )
            ELSE LEAST(
              GREATEST(0, COALESCE(net_amount, 0)),
              GREATEST(COALESCE(paid_amount, 0), tender_amt)
            )
          END
        - COALESCE(sale_return_adjust, 0)
    ) AS outstanding
  FROM pos_sales ps
),
cashier_sales AS (
  SELECT * FROM sales_in_range
  WHERE cancelled = false
    AND COALESCE(payment_status, '') <> 'cancelled'
    AND NOT is_hold_cashier
),
cashier_cash AS (
  SELECT
    cs.id,
    CASE
      WHEN payment_method = 'multiple' THEN
        CASE
          WHEN GREATEST(0, COALESCE(cash_amount, 0))
             + GREATEST(0, COALESCE(card_amount, 0))
             + GREATEST(0, COALESCE(upi_amount, 0))
               <= GREATEST(0, report_net) + 0.0001
          THEN GREATEST(0, COALESCE(cash_amount, 0))
          ELSE
            GREATEST(
              0,
              GREATEST(0, COALESCE(cash_amount, 0))
                - GREATEST(
                    0,
                    GREATEST(0, COALESCE(cash_amount, 0))
                      + GREATEST(0, COALESCE(card_amount, 0))
                      + GREATEST(0, COALESCE(upi_amount, 0))
                      - GREATEST(0, report_net)
                  )
            )
        END
      WHEN payment_method = 'cash' THEN COALESCE(NULLIF(cash_amount, 0), report_net)
      WHEN payment_method = 'card' THEN 0
      WHEN payment_method = 'upi' THEN 0
      WHEN payment_method = 'pay_later' THEN 0
      ELSE report_net
    END AS cash_applied,
    report_net - COALESCE(paid_amount, 0) AS balance_pending,
    COALESCE(refund_amount, 0) AS refund_amount,
    COALESCE(sale_return_adjust, 0) AS sr_adjusted,
    report_gross,
    report_discount,
    report_net
  FROM cashier_sales cs
),
main_sr AS (
  SELECT
    COUNT(*)::int AS sale_return_count,
    ROUND(COALESCE(SUM(sr.net_amount), 0), 2) AS sale_return_total
  FROM public.sale_returns sr
  CROSS JOIN params p
  WHERE sr.organization_id = p.org_id
    AND sr.deleted_at IS NULL
    AND sr.return_date BETWEEN p.start_date AND p.end_date
),
cashier_sr_cash AS (
  SELECT
    COUNT(*)::int AS cash_refund_count,
    ROUND(COALESCE(SUM(sr.net_amount), 0), 2) AS cash_refund_total
  FROM public.sale_returns sr
  CROSS JOIN params p
  WHERE sr.organization_id = p.org_id
    AND sr.deleted_at IS NULL
    AND sr.refund_type = 'cash_refund'
    AND sr.return_date BETWEEN p.start_date AND p.end_date
),
main_via_view AS (
  SELECT ROUND(COALESCE(SUM(v.total_sales), 0), 2) AS total_sales
  FROM public.v_dashboard_sales_summary v
  CROSS JOIN params p
  WHERE v.organization_id = p.org_id
    AND v.sale_day BETWEEN p.start_date AND p.end_date
)
SELECT
  'E_headline_recompute'::text AS section,
  (SELECT org_id FROM params) AS org_id,
  (SELECT start_date FROM params) AS start_date,
  (SELECT end_date FROM params) AS end_date,

  -- MAIN (plain SUM = intent; also report view total for comparison)
  ROUND((SELECT COALESCE(SUM(net_amount), 0) FROM main_sales), 2) AS main_total_sales_plain_sum,
  (SELECT total_sales FROM main_via_view) AS main_total_sales_via_view,
  ROUND(
    ROUND((SELECT COALESCE(SUM(net_amount), 0) FROM main_sales), 2)
      - (SELECT total_sales FROM main_via_view),
    2
  ) AS main_plain_minus_view,
  (SELECT COUNT(*)::int FROM main_sales) AS main_invoice_count,
  (SELECT sale_return_total FROM main_sr) AS main_sr_amount,
  (SELECT sale_return_count FROM main_sr) AS main_sr_count,

  -- POS (sale columns only; pos + DC; non-hold)
  ROUND((SELECT COALESCE(SUM(report_gross), 0) FROM pos_sales), 2) AS pos_sale_amount,
  ROUND((SELECT COALESCE(SUM(pos_net_amt), 0) FROM pos_sales), 2) AS pos_net_sale,
  ROUND((SELECT COALESCE(SUM(COALESCE(cash_amount, 0)), 0) FROM pos_sales), 2) AS pos_cash,
  ROUND((SELECT COALESCE(SUM(COALESCE(card_amount, 0)), 0) FROM pos_sales), 2) AS pos_card,
  ROUND((SELECT COALESCE(SUM(COALESCE(upi_amount, 0)), 0) FROM pos_sales), 2) AS pos_upi,
  ROUND((SELECT COALESCE(SUM(outstanding), 0) FROM pos_with_paid), 2) AS pos_balance,
  ROUND((SELECT COALESCE(SUM(COALESCE(sale_return_adjust, 0)), 0) FROM pos_sales), 2) AS pos_sr_adjusted,
  ROUND((SELECT COALESCE(SUM(COALESCE(refund_amount, 0)), 0) FROM pos_sales), 2) AS pos_refund_amount_on_sales,
  (SELECT COUNT(*)::int FROM pos_sales) AS pos_non_hold_bills,

  -- CASHIER
  ROUND((SELECT COALESCE(SUM(report_gross), 0) FROM cashier_cash), 2) AS cashier_gross,
  ROUND((SELECT COALESCE(SUM(report_discount), 0) FROM cashier_cash), 2) AS cashier_discount,
  ROUND((SELECT COALESCE(SUM(report_net), 0) FROM cashier_cash), 2) AS cashier_net,
  ROUND((SELECT COALESCE(SUM(sr_adjusted), 0) FROM cashier_cash), 2) AS cashier_sr_adjusted,
  ROUND((SELECT COALESCE(SUM(balance_pending), 0) FROM cashier_cash), 2) AS cashier_balance_pending,
  ROUND((SELECT COALESCE(SUM(cash_applied), 0) FROM cashier_cash), 2) AS cashier_cash_collection,
  ROUND((SELECT COALESCE(SUM(refund_amount), 0) FROM cashier_cash), 2) AS cashier_refund_already_in_cash,
  (SELECT cash_refund_total FROM cashier_sr_cash) AS cashier_sr_cash_refund,
  ROUND(
    (SELECT COALESCE(SUM(cash_applied), 0) FROM cashier_cash)
      - (SELECT cash_refund_total FROM cashier_sr_cash),
    2
  ) AS cashier_net_cash_collection,
  (SELECT COUNT(*)::int FROM cashier_cash) AS cashier_bill_count,

  -- DELTAS
  ROUND(
    (SELECT COALESCE(SUM(net_amount), 0) FROM main_sales)
      - (SELECT COALESCE(SUM(pos_net_amt), 0) FROM pos_sales),
    2
  ) AS delta_main_net_minus_pos_net,
  ROUND(
    (SELECT COALESCE(SUM(COALESCE(cash_amount, 0)), 0) FROM pos_sales)
      - (SELECT COALESCE(SUM(cash_applied), 0) FROM cashier_cash),
    2
  ) AS delta_pos_cash_minus_cashier_cash,
  ROUND(
    (SELECT COALESCE(SUM(outstanding), 0) FROM pos_with_paid)
      - (SELECT COALESCE(SUM(balance_pending), 0) FROM cashier_cash),
    2
  ) AS delta_pos_balance_minus_cashier_balance,
  ROUND(
    (SELECT sale_return_total FROM main_sr)
      - (SELECT cash_refund_total FROM cashier_sr_cash),
    2
  ) AS delta_main_sr_minus_cashier_cash_refund
;


-- =============================================================================
-- NOTES
-- =============================================================================
-- Main Total Sales (intent): Σ sales.net_amount, deleted_at IS NULL, not cancelled,
--   IST day in range, ALL sale_types including hold.
-- Main via view: may use sum(DISTINCT net_amount) — see DISTINCT_* sections.
-- Main S/R Amount: Σ sale_returns.net_amount (all refund_type).
-- POS: pos+DC, exclude hold, Sale Amount=gross|net, Net=GREATEST(0,net),
--   Cash/Card/UPI = tender columns, Balance = max(0, net-effective_paid-SRA).
-- Cashier: all sale types, exclude hold/cancelled; Balance = net-paid_amount;
--   Net Cash = cash tender − sale_returns cash_refund.
-- =============================================================================
