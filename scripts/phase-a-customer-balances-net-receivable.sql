-- =============================================================================
-- Phase A — Customer Balances Net Receivable (READ-ONLY)
-- =============================================================================
-- Paste into Supabase SQL Editor (postgres / service_role). Do not run as anon.
-- No INSERT / UPDATE / DELETE. No paid_amount repair.
--
-- What this proves
--   Q1  Window net_receivable = SUM(signed_balance)           [card source]
--   Q2  Card identity: Outstanding − Credit = Net             [UI facets]
--   Q3  Party SQL vs snapshot net_position                    [SQL families]
--   Q4  Party SQL vs Accounts receivables summary             [C-REC vs C-PARTY]
--   Q5  Largest residuals + named fixtures for ledger check
--
-- What this does NOT prove
--   JS getCustomerAccountState (ledger detail). Party and snapshot can agree
--   and still differ from JS enrich. After Q5, open those five ledgers by hand.
--
-- Default org: ELLA NOOR. The inventoryshopof.in screenshot may be another
-- tenant — run SECTION 0 first and change v_org if needed.
--
-- Timeout: party RPC has hit 57014 on this org. Keep 180s. Run sections
-- separately if a combined run cancels.
-- =============================================================================

SET statement_timeout = '180s';

-- Replace this uuid after SECTION 0 if the live page is not ELLA NOOR.
-- v_org is inlined below so each section is independently pasteable.

-- -----------------------------------------------------------------------------
-- SECTION 0 — Which org is the live Customer Balances page?
-- -----------------------------------------------------------------------------
SELECT
  o.id,
  o.name,
  o.slug,
  ws.custom_domain,
  ws.slug AS website_slug
FROM public.organizations o
LEFT JOIN public.website_settings ws ON ws.organization_id = o.id
WHERE o.name ILIKE '%ELLA%'
   OR o.slug ILIKE '%ella%'
   OR o.slug ILIKE '%inventory%'
   OR o.name ILIKE '%inventory%'
   OR COALESCE(ws.custom_domain, '') ILIKE '%inventoryshop%'
   OR COALESCE(ws.custom_domain, '') ILIKE '%inventoryshopof%'
ORDER BY o.name;


-- -----------------------------------------------------------------------------
-- SECTION 1 — Q1 window vs sum + Q2 card identity
-- One call to _get_customer_party_balances_rows.
-- Mirrors src/utils/customerAccountFacets.ts summarizeAccountFacets:
--   outstanding = ROUND(signed) + max(0, ROUND(unused))
--   Outstanding Dr = Σ outstanding where outstanding > 0.5
--   Credit Cr      = Σ unused + Σ |outstanding| where outstanding < -0.5
--   Net            = Σ signed
-- Use out_signed_balance, NEVER out_net_position (that double-subtracts advance).
-- -----------------------------------------------------------------------------
WITH org AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS id
),
party AS (
  SELECT
    out_customer_id,
    out_customer_name,
    ROUND(out_signed_balance) AS signed,
    GREATEST(0, ROUND(COALESCE(out_advance_available, 0))) AS unused,
    out_net_receivable AS window_net,
    out_total_dr AS window_dr_netted,
    out_total_cr AS window_cr_netted
  FROM public._get_customer_party_balances_rows((SELECT id FROM org))
),
facets AS (
  SELECT
    *,
    ROUND(signed + unused) AS outstanding
  FROM party
)
SELECT
  (SELECT name FROM public.organizations WHERE id = (SELECT id FROM org)) AS org_name,
  COUNT(*) AS party_count,
  -- Q1
  MAX(window_net) AS window_net_receivable,
  SUM(signed) AS sum_signed,
  ROUND(MAX(window_net) - SUM(signed), 2) AS q1_window_vs_sum_gap,
  -- Q2 (same numbers the three cards show)
  ROUND(SUM(CASE WHEN outstanding > 0.5 THEN outstanding ELSE 0 END)) AS card_outstanding_dr,
  ROUND(
    SUM(unused)
    + SUM(CASE WHEN outstanding < -0.5 THEN ABS(outstanding) ELSE 0 END)
  ) AS card_credit_cr,
  ROUND(SUM(signed)) AS card_net_receivable,
  ROUND(
    SUM(CASE WHEN outstanding > 0.5 THEN outstanding ELSE 0 END)
    - (
      SUM(unused)
      + SUM(CASE WHEN outstanding < -0.5 THEN ABS(outstanding) ELSE 0 END)
    )
    - SUM(signed)
  ) AS q2_identity_gap,
  -- Window columns are netted Dr/Cr (not the UI cards)
  MAX(window_dr_netted) AS window_total_dr_netted,
  MAX(window_cr_netted) AS window_total_cr_netted,
  CASE
    WHEN ABS(ROUND(MAX(window_net) - SUM(signed), 2)) <= 1
     AND ABS(
       SUM(CASE WHEN outstanding > 0.5 THEN outstanding ELSE 0 END)
       - (SUM(unused) + SUM(CASE WHEN outstanding < -0.5 THEN ABS(outstanding) ELSE 0 END))
       - SUM(signed)
     ) <= 1
    THEN 'PASS — card math is consistent'
    ELSE 'FAIL — do not trust the Net card until this is explained'
  END AS verdict
FROM facets;


-- -----------------------------------------------------------------------------
-- SECTION 2 — Q4 Accounts / timeout-fallback RPC vs Balances Net
-- Fast. Different population (activity-filtered). Gap here is expected if
-- many parties have opening balance only / no activity.
-- -----------------------------------------------------------------------------
WITH org AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS id
),
party_net AS (
  SELECT ROUND(SUM(ROUND(out_signed_balance))) AS card_net
  FROM public._get_customer_party_balances_rows((SELECT id FROM org))
),
rec AS (
  SELECT *
  FROM public.get_organization_receivables_summary((SELECT id FROM org))
)
SELECT
  r.customer_count AS rec_activity_customers,
  r.gross_receivable_dr AS rec_outstanding_dr,
  r.customer_credit_pool_cr AS rec_credit_cr,
  r.net_receivable AS rec_net,
  p.card_net AS party_card_net,
  ROUND(p.card_net - r.net_receivable, 2) AS party_minus_rec_net
FROM rec r
CROSS JOIN party_net p;


-- -----------------------------------------------------------------------------
-- SECTION 3 — Q3 party signed vs snapshot net_position (may timeout)
-- If 57014: skip this and use SECTION 3b (top 50 only).
-- -----------------------------------------------------------------------------
WITH org AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS id
),
party AS (
  SELECT
    out_customer_id,
    out_customer_name,
    ROUND(out_signed_balance) AS signed
  FROM public._get_customer_party_balances_rows((SELECT id FROM org))
),
snap AS (
  SELECT
    customer_id,
    ROUND(net_position) AS snap_net
  FROM public.get_customer_financial_snapshot_all((SELECT id FROM org))
),
joined AS (
  SELECT
    p.out_customer_id,
    p.out_customer_name,
    p.signed,
    s.snap_net,
    p.signed - COALESCE(s.snap_net, p.signed) AS gap
  FROM party p
  LEFT JOIN snap s ON s.customer_id = p.out_customer_id
)
SELECT
  COUNT(*) AS party_rows,
  COUNT(*) FILTER (WHERE snap_net IS NULL) AS missing_from_snapshot,
  COUNT(*) FILTER (WHERE ABS(gap) > 1) AS residual_count_gt_1,
  COALESCE(SUM(gap) FILTER (WHERE ABS(gap) > 1), 0) AS residual_sum,
  COALESCE(SUM(ABS(gap)) FILTER (WHERE ABS(gap) > 1), 0) AS residual_abs_sum,
  CASE
    WHEN COUNT(*) FILTER (WHERE ABS(gap) > 1) = 0 THEN 'PASS — party SQL = snapshot net'
    ELSE 'RESIDUAL — card Net is SQL; ledger JS may still differ on these rows'
  END AS verdict
FROM joined;


-- -----------------------------------------------------------------------------
-- SECTION 3b — Same residual, top 50 |signed| only (timeout fallback)
-- -----------------------------------------------------------------------------
WITH org AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS id
),
party AS (
  SELECT
    out_customer_id,
    out_customer_name,
    ROUND(out_signed_balance) AS signed
  FROM public._get_customer_party_balances_rows((SELECT id FROM org))
),
top50 AS (
  SELECT out_customer_id
  FROM party
  ORDER BY ABS(signed) DESC
  LIMIT 50
),
snap AS (
  SELECT
    customer_id,
    ROUND(net_position) AS snap_net
  FROM public.get_customer_financial_snapshot_batch(
    ARRAY(SELECT out_customer_id FROM top50),
    (SELECT id FROM org)
  )
)
SELECT
  p.out_customer_name,
  p.signed AS party_signed,
  s.snap_net,
  p.signed - COALESCE(s.snap_net, p.signed) AS gap
FROM party p
JOIN top50 t ON t.out_customer_id = p.out_customer_id
LEFT JOIN snap s ON s.customer_id = p.out_customer_id
WHERE ABS(p.signed - COALESCE(s.snap_net, p.signed)) > 1
   OR s.snap_net IS NULL
ORDER BY ABS(p.signed - COALESCE(s.snap_net, p.signed)) DESC;


-- -----------------------------------------------------------------------------
-- SECTION 4 — Q5 top 20 residuals (full snapshot; skip if SECTION 3 timed out)
-- Hand-check the first five against Customer Ledger (CN Available + Advance).
-- -----------------------------------------------------------------------------
WITH org AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS id
),
party AS (
  SELECT
    out_customer_id,
    out_customer_name,
    ROUND(out_signed_balance) AS signed,
    GREATEST(0, ROUND(COALESCE(out_advance_available, 0))) AS unused
  FROM public._get_customer_party_balances_rows((SELECT id FROM org))
),
snap AS (
  SELECT
    customer_id,
    ROUND(net_position) AS snap_net,
    ROUND(COALESCE(cn_available_total, 0)) AS snap_cn,
    ROUND(COALESCE(advance_available, 0)) AS snap_adv
  FROM public.get_customer_financial_snapshot_all((SELECT id FROM org))
)
SELECT
  p.out_customer_name,
  p.signed AS party_signed_net,
  s.snap_net,
  p.signed - COALESCE(s.snap_net, p.signed) AS gap,
  p.unused AS party_advance,
  s.snap_adv,
  s.snap_cn
FROM party p
LEFT JOIN snap s ON s.customer_id = p.out_customer_id
WHERE ABS(p.signed - COALESCE(s.snap_net, p.signed)) > 1
ORDER BY ABS(p.signed - COALESCE(s.snap_net, p.signed)) DESC
LIMIT 20;


-- -----------------------------------------------------------------------------
-- SECTION 5 — Named fixtures (Farhaan / AARISH / SHUMAMA / Aafra class)
-- -----------------------------------------------------------------------------
WITH org AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS id
),
party AS (
  SELECT
    out_customer_name,
    ROUND(out_signed_balance) AS signed,
    GREATEST(0, ROUND(COALESCE(out_advance_available, 0))) AS unused,
    out_direction
  FROM public._get_customer_party_balances_rows((SELECT id FROM org))
)
SELECT
  out_customer_name,
  signed AS party_signed_net,
  unused AS party_advance,
  ROUND(signed + unused) AS recovered_outstanding,
  CASE WHEN ROUND(signed + unused) > 0.5 THEN ROUND(signed + unused) ELSE 0 END AS card_outstanding_col,
  out_direction
FROM party
WHERE out_customer_name ILIKE '%FARHAAN FAB%'
   OR out_customer_name ILIKE '%AARISH%'
   OR out_customer_name ILIKE '%SHUMAMA%'
   OR out_customer_name ILIKE '%AAFRA%'
   OR out_customer_name ILIKE '%HANIF%'
ORDER BY out_customer_name;


-- -----------------------------------------------------------------------------
-- How to read
--   q1_window_vs_sum_gap = 0  → Net card = Σ party signed
--   q2_identity_gap = 0       → Net = Outstanding − Credit (the three cards agree)
--   residual_sum              → how far card Net is from snapshot Net
--   party_minus_rec_net       → Balances vs Accounts headline (often ≠ 0)
--
-- Compare SECTION 1 card_* to the three on-screen cards (all parties, not Dr filter).
-- Screenshot trio ₹44,14,925 / ₹19,68,136 / ₹24,46,789 is only valid if that
-- tenant’s SECTION 1 matches; do not force-fit ELLA NOOR to those figures.
-- =============================================================================
