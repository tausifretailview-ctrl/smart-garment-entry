-- Phase D — Unified customer balance verification gate
--
-- Run AFTER migration 20260822183000_snapshot_facet_semantics.sql
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SQL EDITOR: use SECTION A (party-only) — always works, no JWT required.
-- Do NOT use get_customer_financial_snapshot(customer_id, org) per row — it
-- calls assert_org_member and fails with "Authentication required".
-- Do NOT use get_customer_true_outstanding — same auth failure.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- HOW TO RUN
-- 1. Run DIAG block
-- 2. Run SECTION A gates A-1 … A-5 (party RPC only)
-- 3. Optionally run SECTION B if DIAG shows postgres/service_role
-- 4. ONE block at a time. SET statement_timeout = '120s'; for large orgs.
--
-- Org UUIDs:
--   ELLA NOOR   3fdca631-1e0c-4417-9704-421f5129ff67
--
-- Offline: npm run test:balance-gate


-- =============================================================================
-- DIAG) SQL editor auth context — run first
-- =============================================================================
SELECT
  current_user AS db_role,
  auth.uid() AS auth_uid,
  auth.role() AS auth_role,
  CASE
    WHEN auth.role() = 'anon' THEN 'Use SECTION A only'
    WHEN auth.role() = 'authenticated' AND auth.uid() IS NULL THEN 'Use SECTION A only (authenticated without uid)'
    WHEN auth.role() = 'authenticated' THEN 'SECTION B may work if you are org member'
    ELSE 'SECTION A + B OK (postgres / service_role)'
  END AS editor_status;


-- =============================================================================
-- GATE D-0) Migration applied? (no RPC auth)
-- PASS: migration_applied = TRUE
-- =============================================================================
SELECT
  p.proname,
  pg_get_functiondef(p.oid) LIKE '%gross_outstanding_dr%' AS migration_202608221830_applied
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_customer_financial_snapshot';


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION A — PARTY-ONLY GATES (SQL editor safe — no JWT)
-- Same checks the Customer Balances page uses after the timeout fix.
-- PASS for each gate = zero rows returned.
-- ═══════════════════════════════════════════════════════════════════════════

-- -----------------------------------------------------------------------------
-- GATE A-1 / D-1) net_position = signed_balance (not signed − advance)
-- Replaces per-customer get_customer_financial_snapshot facet check.
-- -----------------------------------------------------------------------------
SELECT
  customer_name,
  signed_balance,
  net_position,
  advance_available,
  ROUND(signed_balance - net_position, 2) AS net_identity_drift
FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
WHERE ABS(signed_balance - net_position) > 0.01
ORDER BY ABS(signed_balance - net_position) DESC
LIMIT 50;


-- -----------------------------------------------------------------------------
-- GATE A-2 / D-2) Legacy net_position double-subtract detector
-- FAIL if net_position still equals signed_balance − advance (pre-migration bug).
-- PASS: zero rows when advance > 0
-- -----------------------------------------------------------------------------
SELECT
  customer_name,
  signed_balance,
  advance_available,
  net_position,
  ROUND(signed_balance - GREATEST(advance_available, 0), 2) AS legacy_wrong_net,
  ROUND(signed_balance - net_position, 2) AS net_drift
FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
WHERE GREATEST(advance_available, 0) > 0.01
  AND ABS(net_position - (signed_balance - GREATEST(advance_available, 0))) <= 0.01
  AND ABS(signed_balance - net_position) > 0.01
LIMIT 50;


-- -----------------------------------------------------------------------------
-- GATE A-3) Implied gross facet sanity (party row self-consistency)
-- UI gross outstanding = signed_balance + advance_available (Aafra recovery).
-- PASS: zero rows among non-settled customers
-- -----------------------------------------------------------------------------
SELECT
  customer_name,
  signed_balance,
  advance_available,
  net_position,
  ROUND(signed_balance + GREATEST(advance_available, 0), 2) AS implied_gross_outstanding
FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
WHERE (ABS(signed_balance) > 0.01 OR advance_available > 0.01)
  AND signed_balance + GREATEST(advance_available, 0) < net_position - 0.01
LIMIT 50;


-- -----------------------------------------------------------------------------
-- GATE A-4 / D-4) Non-settled party rows — signed net direction sanity
-- PASS: zero rows (impossible signed/advance combos)
-- -----------------------------------------------------------------------------
SELECT
  customer_name,
  signed_balance,
  advance_available,
  net_position
FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
WHERE ABS(signed_balance) > 0.01
  AND ABS(signed_balance - net_position) > 0.01
LIMIT 50;


-- -----------------------------------------------------------------------------
-- GATE A-5 / D-5) Aafra refund-safe spot check (party RPC)
-- PASS: at least one row with implied_gross > net when advance + invoice Dr
-- (Manual read — not a zero-row gate)
-- -----------------------------------------------------------------------------
SELECT
  customer_name,
  signed_balance AS net_position,
  advance_available,
  ROUND(signed_balance + GREATEST(advance_available, 0), 2) AS implied_gross_outstanding,
  ROUND(
    signed_balance + GREATEST(advance_available, 0) - signed_balance,
    2
  ) AS gross_minus_net
FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
WHERE customer_name ILIKE '%aafra%'
  AND advance_available > 0.01
  AND signed_balance > 0.01;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION B — SNAPSHOT_ALL GATES (postgres / service_role only)
-- Skip if SECTION A passes and UI sign-off is green.
-- Uses get_customer_financial_snapshot_all — NOT per-customer snapshot.
-- ═══════════════════════════════════════════════════════════════════════════

-- -----------------------------------------------------------------------------
-- GATE B-1) Snapshot facet identities (snapshot_all)
-- PASS: zero rows
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- GATE B-2) Party vs snapshot_all parity (non-settled)
-- PASS: zero rows
-- -----------------------------------------------------------------------------
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
  ROUND(p.net_position - s.net_position, 2) AS net_drift
FROM party p
JOIN snap s ON s.customer_id = p.customer_id
WHERE ABS(p.signed_balance - s.outstanding_dr) > 0.01
   OR ABS(p.net_position - s.net_position) > 0.01
   OR ABS(p.advance_available - s.advance_available) > 0.01
LIMIT 50;


-- -----------------------------------------------------------------------------
-- GATE B-3 / D-4 alt) Party implied gross vs snapshot gross_outstanding_dr
-- PASS: zero rows
-- -----------------------------------------------------------------------------
WITH party AS (
  SELECT customer_id, customer_name, signed_balance, advance_available
  FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
  WHERE ABS(signed_balance) > 0.01 OR COALESCE(advance_available, 0) > 0.01
),
snap AS (
  SELECT customer_id, gross_outstanding_dr
  FROM public.get_customer_financial_snapshot_all('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
)
SELECT
  p.customer_name,
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
LIMIT 50;


-- -----------------------------------------------------------------------------
-- GATE B-4 / D-5 alt) Aafra spot check (snapshot_all)
-- -----------------------------------------------------------------------------
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
-- GATE D-6) UI manual sign-off (not SQL)
-- =============================================================================
-- [ ] Customer Balances page loads (no statement timeout)
-- [ ] Ledger = Payment tab = POS picker = Party (±₹1 per customer)
-- [ ] Customer Reconciliation: 0 rows drift > ₹1
-- [ ] run-invariant-digest: paid_diverges_from_receipts did not rise


-- =============================================================================
-- ⛔ DO NOT RUN IN SQL EDITOR (will fail: Authentication required)
-- =============================================================================
-- Per-customer snapshot:
--   SELECT * FROM get_customer_financial_snapshot('<customer_id>', '<org_id>');
-- Per-customer canonical:
--   SELECT get_customer_true_outstanding('<customer_id>', '<org_id>');
-- Org-wide with LATERAL per customer:
--   CROSS JOIN LATERAL get_customer_financial_snapshot(c.id, c.organization_id)
