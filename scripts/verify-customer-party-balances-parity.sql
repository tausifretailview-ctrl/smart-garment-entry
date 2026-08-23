-- Parity gate for get_customer_party_balances vs canonical reconcile_customer_balance.
-- Run in Supabase SQL editor AFTER applying migrations through
-- 20260823180000_fix_cn_receipt_double_count_v2_reconcile.sql (partial CN + CN memo)
-- and 20260911150000_fix_party_balances_paid_at_sale_drift_parity.sql (POS paid-at-sale).
--
-- IMPORTANT: Select and run ONE block at a time (do not Run entire file).
-- Heavy gates: run `SET statement_timeout = '120s';` first if you hit timeout.
--
-- SQL EDITOR AUTH:
--   Do NOT use get_customer_true_outstanding — fails with 42501 Authentication required
--   (assert_org_member). Do NOT use reconcile_customer_balances — it calls the same helper.
--   USE instead:
--     SUM(amount) FROM reconcile_customer_balance(customer_id, org_id)  — per-customer, OK
--     get_customer_party_balances(org_id) vs _get_customer_party_balances_rows_v2 — fast org gate
--
-- Orgs:
--   ELLA NOOR (invoice) 3fdca631-1e0c-4417-9704-421f5129ff67
--   KS FOOTWEAR (POS)    4bc73037-e877-4123-9261-eb6e3876698c
--   Velvet (POS)         dafc3d0c-874e-4784-bac3-5eab5f3c85b5


-- =============================================================================
-- DIAG) Auth context — run first
-- =============================================================================
SELECT
  current_user AS db_role,
  auth.uid() AS auth_uid,
  auth.role() AS auth_role,
  CASE
    WHEN auth.uid() IS NULL THEN 'Use reconcile_customer_balance SUM (this script)'
    ELSE 'Authenticated session'
  END AS editor_hint;


-- =============================================================================
-- DIAG) Migration 20260911150000 applied? (paid_at_sale_drift per-sale subquery)
-- =============================================================================
SELECT
  p.proname,
  pg_get_functiondef(p.oid) LIKE '%sub.customer_id AS cust_id%' AS migration_111500_applied,
  pg_get_functiondef(p.oid) LIKE '%sale_voucher_receipts%' AS still_has_old_sale_voucher_cte
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = '_get_customer_party_balances_rows';


-- =============================================================================
-- DIAG) Smoke — party RPC compiles and returns rows
-- =============================================================================
SELECT COUNT(*) AS party_row_count
FROM public.get_customer_party_balances('dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid);


-- =============================================================================
-- 0a) Seven-customer sign-off — drift must be 0
--     SHEHNAZ HALAI, Fariba Qureshi, Sana Nasir, Shumama Baireli, Samiya Nursumar, ALOK,
--     Farhaan Fab (partial CN ₹100 remainder)
-- =============================================================================
WITH party AS (
  SELECT customer_id, customer_name, signed_balance, advance_available
  FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
  WHERE customer_id = 'a7b7e39c-fde8-4df5-8ac5-cb312460234e'::uuid
     OR customer_name = 'Fariba Qureshi'
     OR customer_name ILIKE '%sana%nasir%'
     OR customer_name ILIKE '%shumama%baireli%'
     OR customer_name ILIKE '%samiya%nursumar%'
     OR customer_name ILIKE '%alok%kumar%tazim%'
     OR customer_name ILIKE '%farhaan%fab%'
)
SELECT
  p.customer_name,
  p.signed_balance AS party_balance,
  canon.canonical_balance,
  ROUND(p.signed_balance - canon.canonical_balance, 2) AS drift,
  p.advance_available AS party_advance,
  public._customer_advance_available(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) AS canonical_advance
FROM party p
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(r.amount), 0)::numeric AS canonical_balance
  FROM public.reconcile_customer_balance(
    p.customer_id,
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  ) r
) canon
ORDER BY p.customer_name;


-- =============================================================================
-- 0) Three-customer sign-off (ELLA NOOR): Samiya, ALOK, SHEHNAZ HALAI
-- =============================================================================
WITH party AS (
  SELECT customer_id, customer_name, signed_balance, advance_available
  FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
  WHERE customer_name ILIKE '%samiya%'
     OR customer_name ILIKE '%alok%kumar%tazim%'
     OR customer_id = 'a7b7e39c-fde8-4df5-8ac5-cb312460234e'::uuid
)
SELECT
  p.customer_name,
  p.signed_balance AS party_balance,
  canon.canonical_balance,
  ROUND(p.signed_balance - canon.canonical_balance, 2) AS drift,
  p.advance_available AS party_advance,
  public._customer_advance_available(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) AS canonical_advance
FROM party p
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(r.amount), 0)::numeric AS canonical_balance
  FROM public.reconcile_customer_balance(
    p.customer_id,
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  ) r
) canon
ORDER BY p.customer_name;


-- =============================================================================
-- 1-fast) ELLA NOOR — party RPC vs v2 internal rows (set-based, SQL-editor safe)
--         MUST return ZERO rows. Run this before block 1-slow on large orgs.
-- =============================================================================
WITH live AS (
  SELECT customer_id, customer_name, signed_balance, advance_available, net_position
  FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
  WHERE ABS(signed_balance) > 0.01 OR COALESCE(advance_available, 0) > 0.01
),
v2 AS (
  SELECT
    out_customer_id AS customer_id,
    out_signed_balance AS signed_balance,
    out_advance_available AS advance_available,
    out_net_position AS net_position
  FROM public._get_customer_party_balances_rows_v2('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
)
SELECT
  COALESCE(l.customer_name, cu.customer_name) AS customer_name,
  l.signed_balance AS live_signed,
  v.signed_balance AS v2_signed,
  ROUND(COALESCE(l.signed_balance, 0) - COALESCE(v.signed_balance, 0), 2) AS signed_drift,
  l.advance_available AS live_advance,
  v.advance_available AS v2_advance,
  ROUND(COALESCE(l.advance_available, 0) - COALESCE(v.advance_available, 0), 2) AS advance_drift
FROM live l
FULL OUTER JOIN v2 v ON v.customer_id = l.customer_id
LEFT JOIN public.customers cu ON cu.id = COALESCE(l.customer_id, v.customer_id)
WHERE l.customer_id IS NULL
   OR v.customer_id IS NULL
   OR ABS(COALESCE(l.signed_balance, 0) - COALESCE(v.signed_balance, 0)) > 0.01
   OR ABS(COALESCE(l.advance_available, 0) - COALESCE(v.advance_available, 0)) > 0.01
ORDER BY ABS(COALESCE(l.signed_balance, 0) - COALESCE(v.signed_balance, 0)) DESC
LIMIT 50;


-- =============================================================================
-- 1-slow) ELLA NOOR — non-settled party vs reconcile_customer_balance SUM
--         Must return ZERO rows. Slow on large orgs — prefer 1-fast first.
-- =============================================================================
WITH party AS (
  SELECT customer_id, signed_balance, advance_available
  FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
  WHERE ABS(signed_balance) > 0.01
     OR COALESCE(advance_available, 0) > 0.01
)
SELECT
  cu.customer_name,
  p.signed_balance AS party_balance,
  canon.canonical_balance,
  ROUND(p.signed_balance - canon.canonical_balance, 2) AS drift,
  p.advance_available AS party_advance,
  public._customer_advance_available(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) AS canonical_advance,
  ROUND(
    COALESCE(p.advance_available, 0)
    - public._customer_advance_available(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid),
    2
  ) AS advance_drift
FROM party p
JOIN public.customers cu ON cu.id = p.customer_id
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(r.amount), 0)::numeric AS canonical_balance
  FROM public.reconcile_customer_balance(
    p.customer_id,
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  ) r
) canon
WHERE ABS(p.signed_balance - canon.canonical_balance) > 0.01
   OR ABS(
     COALESCE(p.advance_available, 0)
     - public._customer_advance_available(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
   ) > 0.01
ORDER BY ABS(p.signed_balance - canon.canonical_balance) DESC;


-- =============================================================================
-- 2) Customers missing from party list (should be none)
-- =============================================================================
SELECT c.id, c.customer_name
FROM public.customers c
WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) p
    WHERE p.customer_id = c.id
  );


-- =============================================================================
-- 3) Grand totals vs get_organization_receivables_summary
-- =============================================================================
WITH party AS (
  SELECT total_dr, total_cr, net_receivable
  FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
  LIMIT 1
),
summary AS (
  SELECT gross_receivable_dr, customer_credit_pool_cr, net_receivable
  FROM public.get_organization_receivables_summary('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
)
SELECT
  p.total_dr AS party_total_dr,
  s.gross_receivable_dr AS summary_total_dr,
  ROUND(p.total_dr - s.gross_receivable_dr, 2) AS dr_drift,
  p.total_cr AS party_total_cr,
  s.customer_credit_pool_cr AS summary_total_cr,
  ROUND(p.total_cr - s.customer_credit_pool_cr, 2) AS cr_drift,
  p.net_receivable AS party_net,
  s.net_receivable AS summary_net,
  ROUND(p.net_receivable - s.net_receivable, 2) AS net_drift
FROM party p
CROSS JOIN summary s;


-- =============================================================================
-- 4) Sample customers for manual sign-off (party picks + reconcile SUM)
-- =============================================================================
WITH picks AS (
  SELECT customer_id, customer_name, signed_balance, advance_available, direction, net_position
  FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
  ORDER BY
    CASE
      WHEN advance_available > 0.01 THEN 0
      WHEN signed_balance < -0.5 THEN 1
      WHEN signed_balance > 100000 THEN 2
      WHEN ABS(signed_balance) <= 0.5 THEN 3
      ELSE 4
    END,
    ABS(signed_balance) DESC
  LIMIT 8
)
SELECT
  pk.customer_id,
  pk.customer_name,
  canon.canonical_balance,
  pk.signed_balance AS party_balance,
  ROUND(canon.canonical_balance - pk.signed_balance, 2) AS drift,
  public._customer_advance_available(pk.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) AS canonical_advance,
  pk.advance_available AS party_advance,
  pk.direction,
  pk.net_position
FROM picks pk
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(r.amount), 0)::numeric AS canonical_balance
  FROM public.reconcile_customer_balance(
    pk.customer_id,
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  ) r
) canon
ORDER BY ABS(canon.canonical_balance) DESC;


-- =============================================================================
-- 5) Performance smoke — party RPC only
-- =============================================================================
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT COUNT(*), SUM(signed_balance)
FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid);


-- =============================================================================
-- 6) KS FOOTWEAR POS — VAVIA + JOHNSON spot check
--     Org: 4bc73037-e877-4123-9261-eb6e3876698c
-- =============================================================================
WITH party AS (
  SELECT customer_id, customer_name, signed_balance
  FROM public.get_customer_party_balances('4bc73037-e877-4123-9261-eb6e3876698c'::uuid)
  WHERE customer_id IN (
    'a5727aac-8f3a-41c9-a8a5-f4af37ba160f'::uuid,
    '970cffc5-4d1e-4ac0-bf4a-70d4188f5690'::uuid
  )
)
SELECT
  p.customer_name,
  p.signed_balance AS party_balance,
  canon.canonical_balance,
  ROUND(p.signed_balance - canon.canonical_balance, 2) AS drift
FROM party p
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(r.amount), 0)::numeric AS canonical_balance
  FROM public.reconcile_customer_balance(
    p.customer_id,
    '4bc73037-e877-4123-9261-eb6e3876698c'::uuid
  ) r
) canon
ORDER BY p.customer_name;


-- KS FOOTWEAR — non-settled drift gate (must return ZERO rows)
WITH party AS (
  SELECT customer_id, signed_balance
  FROM public.get_customer_party_balances('4bc73037-e877-4123-9261-eb6e3876698c'::uuid)
  WHERE ABS(signed_balance) > 0.01
)
SELECT
  cu.customer_name,
  p.signed_balance AS party_balance,
  canon.canonical_balance,
  ROUND(p.signed_balance - canon.canonical_balance, 2) AS drift
FROM party p
JOIN public.customers cu ON cu.id = p.customer_id
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(r.amount), 0)::numeric AS canonical_balance
  FROM public.reconcile_customer_balance(
    p.customer_id,
    '4bc73037-e877-4123-9261-eb6e3876698c'::uuid
  ) r
) canon
WHERE ABS(p.signed_balance - canon.canonical_balance) > 0.01
ORDER BY ABS(p.signed_balance - canon.canonical_balance) DESC;


-- =============================================================================
-- 7) Velvet POS — RUSHITA + KALPANA + BEENA spot check
--     Org: dafc3d0c-874e-4784-bac3-5eab5f3c85b5
-- =============================================================================
WITH party AS (
  SELECT customer_id, customer_name, signed_balance
  FROM public.get_customer_party_balances('dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid)
  WHERE customer_name ILIKE '%rushita%sanghvi%'
     OR customer_name = 'KALPANA'
     OR customer_name ILIKE '%beena%shah%'
)
SELECT
  p.customer_name,
  p.signed_balance AS party_balance,
  canon.canonical_balance,
  ROUND(p.signed_balance - canon.canonical_balance, 2) AS drift
FROM party p
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(r.amount), 0)::numeric AS canonical_balance
  FROM public.reconcile_customer_balance(
    p.customer_id,
    'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid
  ) r
) canon
ORDER BY p.customer_name;


-- Velvet — non-settled drift gate (must return ZERO rows)
WITH party AS (
  SELECT customer_id, signed_balance
  FROM public.get_customer_party_balances('dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid)
  WHERE ABS(signed_balance) > 0.01
)
SELECT
  cu.customer_name,
  p.signed_balance AS party_balance,
  canon.canonical_balance,
  ROUND(p.signed_balance - canon.canonical_balance, 2) AS drift
FROM party p
JOIN public.customers cu ON cu.id = p.customer_id
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(r.amount), 0)::numeric AS canonical_balance
  FROM public.reconcile_customer_balance(
    p.customer_id,
    'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid
  ) r
) canon
WHERE ABS(p.signed_balance - canon.canonical_balance) > 0.01
ORDER BY ABS(p.signed_balance - canon.canonical_balance) DESC;
