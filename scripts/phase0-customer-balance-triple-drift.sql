-- Phase 0 (SQL editor / postgres) — cheap full-org gates. No writes.
-- Run ONE block at a time. ELLA NOOR default; edit params for other orgs.
--
-- KS FOOTWEAR  4bc73037-e877-4123-9261-eb6e3876698c
-- VELVET       dafc3d0c-874e-4784-bac3-5eab5f3c85b5
--
-- Block A: party vs snapshot_all (SQL↔SQL). Expect diff_rows = 0 after #441.
-- Block B: leftover-CN / refund-on-applied **candidate** counts (not the three
--          formula values — those need the Node JWT script).
-- Block C: KPI card totals from party RPC (what the list actually paints).

-- =============================================================================
-- A) party vs snapshot_all
-- =============================================================================
SET statement_timeout = '180s';

WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
),
all_snap AS (
  SELECT customer_id, outstanding_dr, advance_available, net_position
  FROM public.get_customer_financial_snapshot_all((SELECT org_id FROM params))
),
party AS (
  SELECT customer_id, customer_name, signed_balance, advance_available, net_position,
         total_dr, total_cr, net_receivable
  FROM public.get_customer_party_balances((SELECT org_id FROM params))
),
compared AS (
  SELECT
    p.customer_id,
    p.customer_name,
    p.signed_balance AS party_signed,
    a.outstanding_dr AS snap_signed,
    ABS(COALESCE(a.outstanding_dr, 0) - COALESCE(p.signed_balance, 0)) AS d_signed,
    ABS(COALESCE(a.advance_available, 0) - COALESCE(p.advance_available, 0)) AS d_advance
  FROM party p
  FULL OUTER JOIN all_snap a ON a.customer_id = p.customer_id
)
SELECT
  (SELECT org_id FROM params) AS org_id,
  (SELECT COUNT(*) FROM party) AS party_rows,
  (SELECT COUNT(*) FROM all_snap) AS snapshot_rows,
  COUNT(*) FILTER (WHERE d_signed > 1 OR d_advance > 1) AS diff_rows_gt_1,
  ROUND(COALESCE(SUM(d_signed) FILTER (WHERE d_signed > 1), 0)::numeric, 2) AS abs_signed_divergence,
  ROUND(MAX(d_signed)::numeric, 2) AS max_signed_delta
FROM compared;


-- =============================================================================
-- B) shape candidates (split leftover CN / refund vs non-pending SR)
-- =============================================================================
SET statement_timeout = '120s';

WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
),
sr AS (
  SELECT
    sr.customer_id,
    sr.id,
    sr.net_amount,
    sr.credit_status,
    sr.credit_available_balance,
    sr.linked_sale_id,
    sr.refund_type,
    public._sale_return_remaining_credit_for_balance(
      sr.net_amount,
      sr.credit_available_balance,
      COALESCE(ls.sale_return_adjust, 0)
    ) AS remaining_via_linked
  FROM public.sale_returns sr
  LEFT JOIN public.sales ls
    ON ls.id = sr.linked_sale_id
   AND ls.organization_id = sr.organization_id
   AND ls.deleted_at IS NULL
  WHERE sr.organization_id = (SELECT org_id FROM params)
    AND sr.deleted_at IS NULL
),
sra_sales AS (
  SELECT s.customer_id, COUNT(*) FILTER (WHERE COALESCE(s.sale_return_adjust, 0) > 1) AS sra_invoice_count
  FROM public.sales s
  WHERE s.organization_id = (SELECT org_id FROM params)
    AND s.deleted_at IS NULL
  GROUP BY s.customer_id
),
refunds AS (
  SELECT ve.reference_id::uuid AS customer_id,
         SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0))) AS refund_amt
  FROM public.voucher_entries ve
  WHERE ve.organization_id = (SELECT org_id FROM params)
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'payment'
    AND lower(COALESCE(ve.reference_type, '')) = 'customer'
  GROUP BY ve.reference_id
)
SELECT
  COUNT(*) FILTER (
    WHERE sr.remaining_via_linked > 1
      AND lower(trim(COALESCE(sr.credit_status, ''))) NOT IN ('pending', 'refunded')
  ) AS leftover_on_applied_sr_rows,
  COUNT(DISTINCT sr.customer_id) FILTER (
    WHERE sr.remaining_via_linked > 1
      AND lower(trim(COALESCE(sr.credit_status, ''))) NOT IN ('pending', 'refunded')
  ) AS leftover_on_applied_sr_customers,
  COUNT(DISTINCT sr.customer_id) FILTER (
    WHERE sr.remaining_via_linked > 1
      AND COALESCE(sra.sra_invoice_count, 0) >= 2
  ) AS split_cn_candidate_customers,
  COUNT(DISTINCT sr.customer_id) FILTER (
    WHERE sr.remaining_via_linked > 1
      AND COALESCE(rf.refund_amt, 0) > 1
      AND lower(trim(COALESCE(sr.credit_status, ''))) <> 'pending'
  ) AS refund_on_applied_candidate_customers,
  ROUND(COALESCE(SUM(sr.remaining_via_linked) FILTER (
    WHERE sr.remaining_via_linked > 1
      AND lower(trim(COALESCE(sr.credit_status, ''))) NOT IN ('pending', 'refunded')
  ), 0)::numeric, 2) AS leftover_on_applied_sr_rupees
FROM sr
LEFT JOIN sra_sales sra ON sra.customer_id = sr.customer_id
LEFT JOIN refunds rf ON rf.customer_id = sr.customer_id;


-- =============================================================================
-- C) KPI cards from party RPC (un-enriched)
-- =============================================================================
SET statement_timeout = '120s';

SELECT
  COUNT(*) AS party_rows,
  ROUND(MAX(total_dr)::numeric, 2) AS kpi_total_outstanding_dr_rpc,
  ROUND(MAX(total_cr)::numeric, 2) AS kpi_total_credit_cr_rpc,
  ROUND(MAX(net_receivable)::numeric, 2) AS kpi_net_receivable_rpc
FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid);


-- =============================================================================
-- LIVE APPLY GATE (run BEFORE treating A2/A3 as post-fix)
-- Must return a row for 20261219120000. Empty = repo-only, not Lovable-applied.
-- =============================================================================
SELECT version, name, inserted_at
FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20261126120000',
  '20261127120000',
  '20261219120000'
)
ORDER BY version;


-- =============================================================================
-- A2) INNER JOIN party vs snapshot_all (overlap only)
-- Pre-fix: 663 diffs, abs ₹23,94,895. Post-fix: 17 mirrors must be gone.
-- =============================================================================
SET statement_timeout = '180s';

WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
),
all_snap AS (
  SELECT customer_id, outstanding_dr, advance_available
  FROM public.get_customer_financial_snapshot_all((SELECT org_id FROM params))
),
party AS (
  SELECT customer_id, customer_name, signed_balance, advance_available
  FROM public.get_customer_party_balances((SELECT org_id FROM params))
),
compared AS (
  SELECT
    p.customer_id,
    p.customer_name,
    p.signed_balance AS party_signed,
    a.outstanding_dr AS snap_signed,
    a.advance_available AS snap_adv,
    p.signed_balance - a.outstanding_dr AS party_minus_snap,
    ABS(p.signed_balance - a.outstanding_dr) AS d_signed
  FROM party p
  INNER JOIN all_snap a ON a.customer_id = p.customer_id
)
SELECT
  COUNT(*) AS overlap_rows,
  COUNT(*) FILTER (WHERE d_signed > 1) AS diff_rows_gt_1,
  ROUND(COALESCE(SUM(d_signed) FILTER (WHERE d_signed > 1), 0)::numeric, 2) AS abs_signed_divergence,
  ROUND(MAX(d_signed)::numeric, 2) AS max_signed_delta
FROM compared;


-- =============================================================================
-- A3) split  diffs into unused-advance netting vs leftover-CN (not explained)
-- Pre-fix: 554 explained_by_advance, 109 not_explained. 17 mirrors in the 109.
-- =============================================================================
SET statement_timeout = '180s';

WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
),
all_snap AS (
  SELECT customer_id, outstanding_dr, advance_available
  FROM public.get_customer_financial_snapshot_all((SELECT org_id FROM params))
),
party AS (
  SELECT customer_id, customer_name, signed_balance
  FROM public.get_customer_party_balances((SELECT org_id FROM params))
),
compared AS (
  SELECT
    p.customer_id,
    p.customer_name,
    p.signed_balance AS party_signed,
    a.outstanding_dr AS snap_signed,
    COALESCE(a.advance_available, 0) AS snap_adv,
    p.signed_balance - a.outstanding_dr AS party_minus_snap,
    ABS(p.signed_balance - a.outstanding_dr) AS d_signed
  FROM party p
  INNER JOIN all_snap a ON a.customer_id = p.customer_id
  WHERE ABS(p.signed_balance - a.outstanding_dr) > 1
),
classified AS (
  SELECT
    *,
    ABS(party_signed - (snap_signed + snap_adv)) <= 1 AS explained_by_advance,
    party_signed = -snap_signed AND party_signed <> 0 AS is_mirror
  FROM compared
)
SELECT
  COUNT(*) AS diff_rows,
  COUNT(*) FILTER (WHERE explained_by_advance) AS explained_by_advance,
  COUNT(*) FILTER (WHERE NOT explained_by_advance) AS not_explained_by_advance,
  COUNT(*) FILTER (WHERE is_mirror AND NOT explained_by_advance) AS leftover_mirrors,
  ROUND(COALESCE(SUM(GREATEST(party_signed, 0)) FILTER (WHERE NOT explained_by_advance), 0)::numeric, 2)
    AS not_explained_party_dr
FROM classified;


-- Named 17-mirror set (must all be gone post-fix: party_signed = snap_signed)
SELECT customer_name, party_signed, snap_signed, snap_adv, party_minus_snap
FROM (
  WITH params AS (
    SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
  ),
  all_snap AS (
    SELECT customer_id, outstanding_dr, advance_available
    FROM public.get_customer_financial_snapshot_all((SELECT org_id FROM params))
  ),
  party AS (
    SELECT customer_id, customer_name, signed_balance
    FROM public.get_customer_party_balances((SELECT org_id FROM params))
  )
  SELECT
    p.customer_name,
    p.signed_balance AS party_signed,
    a.outstanding_dr AS snap_signed,
    COALESCE(a.advance_available, 0) AS snap_adv,
    p.signed_balance - a.outstanding_dr AS party_minus_snap
  FROM party p
  INNER JOIN all_snap a ON a.customer_id = p.customer_id
  WHERE p.customer_id IN (
    '06e8d6a2-7e27-47fe-9684-db1693775b74', -- ALMAS MOTIWALA
    '00c34380-3602-406d-b9a0-d378a20f7b9c', -- Hanif bhai
    'd1a729d1-8c7d-4411-85ce-6501dbdb2945'  -- FIZA MEMON
  )
    OR (p.signed_balance = -a.outstanding_dr AND p.signed_balance <> 0
        AND ABS(p.signed_balance - a.outstanding_dr) > 1)
) m
ORDER BY ABS(party_minus_snap) DESC;
