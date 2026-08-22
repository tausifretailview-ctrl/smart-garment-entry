-- Phase D — Unified customer balance verification gate
--
-- Run AFTER migrations through 20260822183000_snapshot_facet_semantics.sql
-- (and party parity fixes through 20260911150000 where applicable).
--
-- HOW TO RUN (Supabase / Lovable SQL editor)
-- 1. Run DIAG block first — confirms editor role (postgres/service_role is OK).
-- 2. SET statement_timeout = '120s';  -- for heavy org-wide gates
-- 3. Run ONE numbered gate block at a time (do NOT run the whole file).
--
-- AUTH NOTE
-- Per-customer get_customer_financial_snapshot / get_customer_true_outstanding
-- call assert_org_member and FAIL in the SQL editor ("Authentication required").
-- Gates below use SQL-editor-safe set-based RPCs:
--   • get_customer_financial_snapshot_all(org_id)
--   • get_customer_party_balances(org_id)
--
-- Offline gate (CI / local): npm run test:balance-gate
--
-- Org UUIDs:
--   ELLA NOOR   3fdca631-1e0c-4417-9704-421f5129ff67
--   KS FOOTWEAR 4bc73037-e877-4123-9261-eb6e3876698c
--   Velvet POS  dafc3d0c-874e-4784-bac3-5eab5f3c85b5


-- =============================================================================
-- DIAG) SQL editor auth context — run first
-- PASS: current_user is postgres (or service_role); auth.uid() may be NULL
-- =============================================================================
SELECT
  current_user AS db_role,
  auth.uid() AS auth_uid,
  auth.role() AS auth_role,
  CASE
    WHEN auth.role() = 'anon' THEN 'FAIL — anon cannot run balance gates'
    WHEN auth.role() = 'authenticated' AND auth.uid() IS NULL THEN 'WARN — authenticated without uid'
    ELSE 'OK — use snapshot_all / party gates below'
  END AS editor_status;


-- =============================================================================
-- GATE D-0) Migration 20260822183000 applied? (gross_outstanding_dr column live)
-- PASS: migration_applied = TRUE
-- =============================================================================
SELECT
  p.proname,
  pg_get_functiondef(p.oid) LIKE '%gross_outstanding_dr%' AS migration_202608221830_applied
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_customer_financial_snapshot';


-- =============================================================================
-- GATE D-1) Snapshot facet identities — ELLA NOOR (SQL-editor safe)
-- Uses get_customer_financial_snapshot_all (set-based; no per-customer auth).
-- PASS: zero rows (|drift| <= 0.01)
-- =============================================================================
WITH snap AS (
  SELECT
    s.customer_id,
    c.customer_name,
    s.outstanding_dr,
    s.net_position,
    s.advance_available,
    s.gross_outstanding_dr
  FROM public.get_customer_financial_snapshot_all('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) s
  JOIN public.customers c ON c.id = s.customer_id AND c.deleted_at IS NULL
)
SELECT
  customer_name,
  outstanding_dr,
  net_position,
  ROUND(outstanding_dr - net_position, 2) AS net_identity_drift,
  advance_available,
  gross_outstanding_dr,
  ROUND(outstanding_dr + GREATEST(advance_available, 0) - gross_outstanding_dr, 2) AS gross_identity_drift
FROM snap
WHERE ABS(outstanding_dr - net_position) > 0.01
   OR ABS(outstanding_dr + GREATEST(advance_available, 0) - gross_outstanding_dr) > 0.01
ORDER BY ABS(outstanding_dr - net_position) DESC
LIMIT 50;


-- =============================================================================
-- GATE D-2) Party net_position fix — must equal signed_balance (not signed − advance)
-- PASS: zero rows
-- =============================================================================
SELECT
  customer_name,
  signed_balance,
  advance_available,
  net_position,
  ROUND(signed_balance - net_position, 2) AS net_drift
FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
WHERE ABS(signed_balance - net_position) > 0.01
LIMIT 50;


-- =============================================================================
-- GATE D-3) Party vs snapshot_all parity (non-settled) — SQL-editor safe
-- PASS: zero rows
-- Replaces per-customer get_customer_financial_snapshot (auth-blocked in editor).
-- =============================================================================
WITH party AS (
  SELECT customer_id, customer_name, signed_balance, advance_available, net_position
  FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
  WHERE ABS(signed_balance) > 0.01 OR advance_available > 0.01
),
snap AS (
  SELECT *
  FROM public.get_customer_financial_snapshot_all('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
)
SELECT
  p.customer_name,
  p.signed_balance AS party_signed,
  s.outstanding_dr AS snapshot_signed,
  ROUND(p.signed_balance - s.outstanding_dr, 2) AS signed_drift,
  p.net_position AS party_net,
  s.net_position AS snapshot_net,
  ROUND(p.net_position - s.net_position, 2) AS net_drift,
  p.advance_available AS party_advance,
  s.advance_available AS snapshot_advance,
  ROUND(p.advance_available - s.advance_available, 2) AS advance_drift
FROM party p
JOIN snap s ON s.customer_id = p.customer_id
WHERE ABS(p.signed_balance - s.outstanding_dr) > 0.01
   OR ABS(p.net_position - s.net_position) > 0.01
   OR ABS(p.advance_available - s.advance_available) > 0.01
LIMIT 50;


-- =============================================================================
-- GATE D-4) Party gross facet — signed + advance = snapshot gross_outstanding_dr
-- PASS: zero rows (non-settled customers with activity)
-- Replaces get_customer_true_outstanding loop (auth-blocked in editor).
-- =============================================================================
WITH party AS (
  SELECT customer_id, customer_name, signed_balance, advance_available
  FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
  WHERE ABS(signed_balance) > 0.01
     OR COALESCE(advance_available, 0) > 0.01
),
snap AS (
  SELECT customer_id, gross_outstanding_dr, net_position
  FROM public.get_customer_financial_snapshot_all('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
)
SELECT
  p.customer_name,
  p.signed_balance,
  p.advance_available,
  ROUND(p.signed_balance + GREATEST(p.advance_available, 0), 2) AS party_implied_gross,
  s.gross_outstanding_dr AS snapshot_gross,
  ROUND(
    p.signed_balance + GREATEST(p.advance_available, 0) - s.gross_outstanding_dr,
    2
  ) AS gross_drift
FROM party p
JOIN snap s ON s.customer_id = p.customer_id
WHERE ABS(
  p.signed_balance + GREATEST(p.advance_available, 0) - s.gross_outstanding_dr
) > 0.01
ORDER BY ABS(
  p.signed_balance + GREATEST(p.advance_available, 0) - s.gross_outstanding_dr
) DESC
LIMIT 50;


-- =============================================================================
-- GATE D-5) Aafra refund-safe spot check (SQL-editor safe)
-- PASS: gross_outstanding_dr > net_position when advance pool + invoice Dr coexist
-- =============================================================================
SELECT
  c.customer_name,
  s.outstanding_dr,
  s.net_position,
  s.advance_available,
  s.gross_outstanding_dr,
  s.gross_outstanding_dr - s.net_position AS gross_minus_net
FROM public.customers c
JOIN public.get_customer_financial_snapshot_all('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) s
  ON s.customer_id = c.id
WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND c.deleted_at IS NULL
  AND c.customer_name ILIKE '%aafra%'
  AND s.advance_available > 0.01
  AND s.net_position > 0.01;


-- =============================================================================
-- GATE D-6) UI manual sign-off checklist (not SQL — owner run after deploy)
-- =============================================================================
-- [ ] Customer Balances page headline = Ledger "Amount owed" (same customer, ±₹1)
-- [ ] POS customer picker balance matches Ledger
-- [ ] Customer Balance Activity page: RPC vs legacy banner green (±₹1)
-- [ ] Customer Reconciliation: 0 rows with drift > ₹1
-- [ ] Post receipt: all four screens update to same net within ₹1
-- [ ] run-invariant-digest: paid_diverges_from_receipts count did not increase
--
-- Per-customer canonical check (requires app JWT / org login — NOT SQL editor):
--   SELECT * FROM get_customer_financial_snapshot('<customer_id>', '<org_id>');
--   Compare to Customer Balance Activity closing balance.


-- =============================================================================
-- OPTIONAL — per-customer snapshot (app JWT only; fails in SQL editor)
-- Do NOT use for gate sign-off. Included for in-app debugging only.
-- =============================================================================
-- SELECT * FROM public.get_customer_financial_snapshot(
--   '<customer_id>'::uuid,
--   '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
-- );
