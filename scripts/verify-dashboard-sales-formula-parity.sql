-- =============================================================================
-- Dashboard sales / cash formula parity — READ-ONLY verification
-- =============================================================================
-- Compares Main Dashboard, POS Dashboard, and Daily Cashier Report headline
-- numbers against raw tables using each surface's exact formula (as of 2026-07).
--
-- HOW TO RUN (Supabase SQL editor):
--   1. Edit the params CTE in SECTION 0 (org + date range).
--   2. Run ONE section at a time (A → E). Running the whole file only returns
--      the last SELECT's result set.
--
-- Date basis: Asia/Kolkata calendar day on sale_date / return_date
--   = Main Dashboard (v_dashboard_sales_summary) and a close match for
--   Cashier/POS when the shop runs in IST. Cashier uses browser-local day
--   bounds; for India orgs IST ≡ local.
--
-- Does NOT mutate data. Safe on production.
-- =============================================================================


-- =============================================================================
-- 0) PARAMETERS — edit these two dates + org_id, then re-run each section
-- =============================================================================
-- Example orgs (replace as needed):
--   Velvet (POS)        dafc3d0c-874e-4784-bac3-5eab5f3c85b5
--   KS FOOTWEAR (POS)   4bc73037-e877-4123-9261-eb6e3876698c
--   ELLA NOOR (invoice) 3fdca631-1e0c-4417-9704-421f5129ff67

-- >>> EDIT THESE THREE VALUES, then paste the same values into every section below. <<<
WITH params AS (
  SELECT
    'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid AS org_id,  -- Velvet example; replace
    DATE '2026-07-01' AS start_date,
    DATE '2026-07-24' AS end_date
)
SELECT
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
    'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid AS org_id,
    DATE '2026-07-01' AS start_date,
    DATE '2026-07-24' AS end_date
)
SELECT
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
-- (B1) delivery_challan bills in range — net totals
-- =============================================================================
WITH params AS (
  SELECT
    'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid AS org_id,
    DATE '2026-07-01' AS start_date,
    DATE '2026-07-24' AS end_date
)
SELECT
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
-- (B2) DC rollup + whether Main Dashboard view includes them
--     v_dashboard_sales_summary has NO sale_type filter → DC is included in
--     Main "Total Sales". POS Dashboard includes DC by design.
--     Cashier has NO sale_type filter → DC included there too.
-- =============================================================================
WITH params AS (
  SELECT
    'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid AS org_id,
    DATE '2026-07-01' AS start_date,
    DATE '2026-07-24' AS end_date
),
dc AS (
  SELECT
    COUNT(*)::int AS dc_bill_count,
    COALESCE(SUM(s.net_amount), 0) AS dc_net_total,
    COALESCE(SUM(s.gross_amount), 0) AS dc_gross_total
  FROM public.sales s
  CROSS JOIN params p
  WHERE s.organization_id = p.org_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND s.sale_type = 'delivery_challan'
    AND (timezone('Asia/Kolkata', s.sale_date))::date BETWEEN p.start_date AND p.end_date
),
view_def AS (
  SELECT pg_get_viewdef('public.v_dashboard_sales_summary'::regclass, true) AS view_definition
)
SELECT
  d.dc_bill_count,
  d.dc_net_total,
  d.dc_gross_total,
  (v.view_definition ILIKE '%sale_type%' ) AS view_filters_sale_type,
  (v.view_definition ILIKE '%delivery_challan%' ) AS view_mentions_delivery_challan,
  -- Expect FALSE / FALSE → DC rows are NOT excluded from Main Total Sales
  v.view_definition
FROM dc d
CROSS JOIN view_def v;


-- =============================================================================
-- (C) sale_returns in range grouped by refund_type
--     Expect the ₹7,950 / ₹18,451 (or similar) split across cash_refund /
--     credit_note / exchange to surface here. Main Dashboard S/R Amount =
--     SUM of ALL types (no refund_type filter).
-- =============================================================================
WITH params AS (
  SELECT
    'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid AS org_id,
    DATE '2026-07-01' AS start_date,
    DATE '2026-07-24' AS end_date
)
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

UNION ALL

SELECT
  'ALL (Main Dashboard S/R Amount)' AS refund_type,
  COUNT(*)::int,
  ROUND(COALESCE(SUM(sr.net_amount), 0), 2),
  ROUND(COALESCE(SUM(sr.gross_amount), 0), 2)
FROM public.sale_returns sr
CROSS JOIN params p
WHERE sr.organization_id = p.org_id
  AND sr.deleted_at IS NULL
  AND sr.return_date BETWEEN p.start_date AND p.end_date

ORDER BY 1;


-- =============================================================================
-- (D) Double-subtract candidates:
--     sale.refund_amount > 0 AND a matching cash_refund return row exists.
--     Match via linked_sale_id OR original_sale_number = sale_number.
--     Cashier Net Cash can subtract sale-row negative tender AND sale_returns
--     cash_refund; POS Cash KPI only sees sale tender columns.
-- =============================================================================
WITH params AS (
  SELECT
    'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid AS org_id,
    DATE '2026-07-01' AS start_date,
    DATE '2026-07-24' AS end_date
)
SELECT
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
-- (E) Side-by-side headline recompute from raw tables
--     Each column group mirrors one dashboard's formula.
-- =============================================================================
WITH params AS (
  SELECT
    'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid AS org_id,
    DATE '2026-07-01' AS start_date,
    DATE '2026-07-24' AS end_date
),

-- ---------- shared sales universe (IST day, not deleted) ----------
sales_in_range AS (
  SELECT
    s.*,
    (timezone('Asia/Kolkata', s.sale_date))::date AS sale_day_ist,
    -- Main / POS cancel flag
    COALESCE(s.is_cancelled, false) AS cancelled,
    -- Hold-like (POS stricter: Hold/ pending also needs pay_later)
    (
      s.payment_status = 'hold'
      OR (
        s.payment_status = 'pending'
        AND s.sale_number LIKE 'Hold/%'
        AND s.payment_method = 'pay_later'
      )
    ) AS is_hold_pos,
    -- Hold-like (Cashier: Hold/ pending regardless of payment_method)
    (
      s.payment_status = 'hold'
      OR (
        s.payment_status = 'pending'
        AND s.sale_number LIKE 'Hold/%'
      )
    ) AS is_hold_cashier,
    -- Gross helper (cashierReportUtils.getSaleReportGrossAmount)
    CASE
      WHEN COALESCE(s.gross_amount, 0) > 0 THEN s.gross_amount
      WHEN COALESCE(s.net_amount, 0) > 0 THEN s.net_amount
      ELSE 0
    END AS report_gross,
    -- Discount helper (line+flat+points − round_off)
    (
      COALESCE(s.discount_amount, 0)
      + COALESCE(s.flat_discount_amount, 0)
      + COALESCE(s.points_redeemed_amount, 0)
      - COALESCE(s.round_off, 0)
    ) AS report_discount,
    -- Net used by Cashier (skip wrong-sign round-off detection for SQL;
    -- uses stored net_amount — flag inverted cases separately in A)
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

-- Main Dashboard: v_dashboard_sales_summary filters (no sale_type, no hold exclude)
main_sales AS (
  SELECT *
  FROM sales_in_range
  WHERE cancelled = false
),

-- POS Dashboard money KPIs: pos + delivery_challan, active, non-hold
pos_sales AS (
  SELECT *
  FROM sales_in_range
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

-- Cashier eligible: all sale types, not cancelled, not hold-like
cashier_sales AS (
  SELECT *
  FROM sales_in_range
  WHERE cancelled = false
    AND COALESCE(payment_status, '') <> 'cancelled'
    AND NOT is_hold_cashier
),

-- Cashier cash tender (approx of DailyCashierReport.calculateTotals)
-- mix: peel excess from cash first (allocateMixPaymentToBill, non-negative modes)
-- cash/card/upi single: use column or fallback to net
-- pay_later: credit (not cash)
-- default: treat as cash = net
cashier_cash AS (
  SELECT
    cs.id,
    CASE
      WHEN payment_method = 'multiple' THEN
        -- peel excess from cash → card → upi when tender > bill (bill = report_net)
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
      ELSE report_net  -- default → cash
    END AS cash_applied,
    CASE
      WHEN payment_method = 'pay_later' THEN report_net
      ELSE 0
    END AS credit_applied,
    report_net - COALESCE(paid_amount, 0) AS balance_pending,
    COALESCE(refund_amount, 0) AS refund_amount,
    COALESCE(sale_return_adjust, 0) AS sr_adjusted,
    report_gross,
    report_discount,
    report_net
  FROM cashier_sales cs
),

-- Main S/R Amount (all refund types)
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

-- Cashier cash_refund returns only
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
)
SELECT
  (SELECT org_id FROM params) AS org_id,
  (SELECT start_date FROM params) AS start_date,
  (SELECT end_date FROM params) AS end_date,

  -- ===== MAIN DASHBOARD (get_erp_dashboard_stats / v_dashboard_sales_summary) =====
  ROUND((SELECT COALESCE(SUM(net_amount), 0) FROM main_sales), 2)
    AS main_total_sales,
  (SELECT COUNT(*)::int FROM main_sales) AS main_invoice_count,
  (SELECT sale_return_total FROM main_sr) AS main_sr_amount,
  (SELECT sale_return_count FROM main_sr) AS main_sr_count,

  -- ===== POS DASHBOARD (get_pos_dashboard_stats — sale columns only) =====
  ROUND((SELECT COALESCE(SUM(report_gross), 0) FROM pos_sales), 2)
    AS pos_sale_amount,
  ROUND((SELECT COALESCE(SUM(pos_net_amt), 0) FROM pos_sales), 2)
    AS pos_net_sale,
  ROUND((SELECT COALESCE(SUM(COALESCE(cash_amount, 0)), 0) FROM pos_sales), 2)
    AS pos_cash,
  ROUND((SELECT COALESCE(SUM(COALESCE(card_amount, 0)), 0) FROM pos_sales), 2)
    AS pos_card,
  ROUND((SELECT COALESCE(SUM(COALESCE(upi_amount, 0)), 0) FROM pos_sales), 2)
    AS pos_upi,
  ROUND((SELECT COALESCE(SUM(outstanding), 0) FROM pos_with_paid), 2)
    AS pos_balance,
  ROUND((SELECT COALESCE(SUM(COALESCE(sale_return_adjust, 0)), 0) FROM pos_sales), 2)
    AS pos_sr_adjusted,
  ROUND((SELECT COALESCE(SUM(COALESCE(refund_amount, 0)), 0) FROM pos_sales), 2)
    AS pos_refund_amount_on_sales,
  (SELECT COUNT(*)::int FROM pos_sales) AS pos_non_hold_bills,

  -- ===== CASHIER REPORT (DailyCashierReport.calculateTotals) =====
  ROUND((SELECT COALESCE(SUM(report_gross), 0) FROM cashier_cash), 2)
    AS cashier_gross,
  ROUND((SELECT COALESCE(SUM(report_discount), 0) FROM cashier_cash), 2)
    AS cashier_discount,
  ROUND((SELECT COALESCE(SUM(report_net), 0) FROM cashier_cash), 2)
    AS cashier_net,
  ROUND((SELECT COALESCE(SUM(sr_adjusted), 0) FROM cashier_cash), 2)
    AS cashier_sr_adjusted,
  ROUND((SELECT COALESCE(SUM(balance_pending), 0) FROM cashier_cash), 2)
    AS cashier_balance_pending,
  ROUND((SELECT COALESCE(SUM(cash_applied), 0) FROM cashier_cash), 2)
    AS cashier_cash_collection,
  ROUND((SELECT COALESCE(SUM(refund_amount), 0) FROM cashier_cash), 2)
    AS cashier_refund_already_in_cash,
  (SELECT cash_refund_total FROM cashier_sr_cash) AS cashier_sr_cash_refund,
  ROUND(
    (SELECT COALESCE(SUM(cash_applied), 0) FROM cashier_cash)
      - (SELECT cash_refund_total FROM cashier_sr_cash),
    2
  ) AS cashier_net_cash_collection,
  (SELECT COUNT(*)::int FROM cashier_cash) AS cashier_bill_count,

  -- ===== DELTAS (spot the misalignment) =====
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
-- (E2) Live RPC cross-check vs raw recompute (optional — run separately)
--     Requires a role that can EXECUTE these SECURITY DEFINER RPCs.
--     If assert_org_member fails, skip this block.
-- =============================================================================
WITH params AS (
  SELECT
    'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid AS org_id,
    DATE '2026-07-01' AS start_date,
    DATE '2026-07-24' AS end_date
),
main_rpc AS (
  SELECT public.get_erp_dashboard_stats(p.org_id, p.start_date, p.end_date) AS j
  FROM params p
),
pos_rpc AS (
  SELECT public.get_pos_dashboard_stats(
    p.org_id,
    (p.start_date::timestamp AT TIME ZONE 'Asia/Kolkata'),
    (((p.end_date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') - INTERVAL '1 millisecond'),
    jsonb_build_object(
      'cancelFilter', 'active',
      'paymentMethodFilter', 'all',
      'paymentStatusFilter', '[]'::jsonb,
      'saleTypeFilter', 'all',
      'refundFilter', 'all',
      'creditNoteFilter', 'all',
      'userFilter', 'all'
    ),
    NULL::text,
    NULL::uuid
  ) AS j
  FROM params p
)
SELECT
  ROUND(COALESCE((m.j->>'total_sales')::numeric, 0), 2) AS main_rpc_total_sales,
  ROUND(COALESCE((m.j->>'sale_return_total')::numeric, 0), 2) AS main_rpc_sr_amount,
  COALESCE((m.j->>'invoice_count')::int, 0) AS main_rpc_invoice_count,
  ROUND(COALESCE((p.j->>'totalAmount')::numeric, 0), 2) AS pos_rpc_sale_amount,
  ROUND(COALESCE((p.j->>'netSale')::numeric, 0), 2) AS pos_rpc_net_sale,
  ROUND(COALESCE((p.j->>'totalCash')::numeric, 0), 2) AS pos_rpc_cash,
  ROUND(COALESCE((p.j->>'totalCard')::numeric, 0), 2) AS pos_rpc_card,
  ROUND(COALESCE((p.j->>'totalUpi')::numeric, 0), 2) AS pos_rpc_upi,
  ROUND(COALESCE((p.j->>'totalBalance')::numeric, 0), 2) AS pos_rpc_balance
FROM main_rpc m
CROSS JOIN pos_rpc p;


-- =============================================================================
-- NOTES (formula cheat-sheet)
-- =============================================================================
-- Main Total Sales:
--   Σ sales.net_amount WHERE deleted_at IS NULL AND NOT is_cancelled
--   AND IST(sale_date) in range; ALL sale_types including hold.
--   CAUTION: live view uses sum(DISTINCT net_amount) which can undercount when
--   two invoices on the same IST day share the same net_amount. Section E uses
--   plain SUM (intent). Compare E vs E2 if totals diverge.
-- Main S/R Amount:
--   Σ sale_returns.net_amount WHERE deleted_at IS NULL AND return_date in range
--   (all refund_type).
--
-- POS Sale Amount: Σ gross>0?gross:net  for pos+DC, not hold, not cancelled.
-- POS Net Sale:    Σ GREATEST(0, net_amount)
-- POS Cash/Card/UPI: Σ cash_amount / card_amount / upi_amount (RPC path; no RCP)
-- POS Balance:     Σ max(0, net - effective_paid - sale_return_adjust)
--                  effective_paid = min(net, max(paid_amount, tender))
--
-- Cashier Gross/Disc/Net: helpers above over all non-hold/non-cancelled sales
-- Cashier Balance Pending: Σ (net - paid_amount)  -- NOT floored; no SRA re-subtract
-- Cashier Cash Collection: at-sale tender (mix capped); RCP separate
-- Cashier Net Cash: Cash Collection − Σ sale_returns.cash_refund
-- =============================================================================
