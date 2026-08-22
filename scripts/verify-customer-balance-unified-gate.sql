-- Phase D — Unified customer balance verification gate
--
-- Run AFTER migrations through 20260822183000_snapshot_facet_semantics.sql
-- (and party parity fixes through 20260911150000 where applicable).
--
-- HOW TO RUN
-- 1. Open Supabase SQL editor (Lovable cloud project).
-- 2. SET statement_timeout = '120s';  -- for heavy org-wide gates
-- 3. Run ONE block at a time. Each gate comment says PASS = zero rows (or noted otherwise).
--
-- Offline gate (CI / local): npm run test:balance-gate
--
-- Org UUIDs:
--   ELLA NOOR   3fdca631-1e0c-4417-9704-421f5129ff67
--   KS FOOTWEAR 4bc73037-e877-4123-9261-eb6e3876698c
--   Velvet POS  dafc3d0c-874e-4784-bac3-5eab5f3c85b5


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
-- GATE D-1) Snapshot facet identities — ELLA NOOR org-wide
-- PASS: zero rows (|drift| <= 0.01)
-- See also: scripts/verify-snapshot-facet-semantics.sql blocks 1–2
-- =============================================================================
WITH snap AS (
  SELECT
    c.id AS customer_id,
    c.customer_name,
    s.outstanding_dr,
    s.net_position,
    s.advance_available,
    s.gross_outstanding_dr
  FROM public.customers c
  CROSS JOIN LATERAL public.get_customer_financial_snapshot(c.id, c.organization_id) s
  WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND c.deleted_at IS NULL
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
-- See also: scripts/verify-snapshot-facet-semantics.sql block 3
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
-- GATE D-3) Snapshot vs party signed_balance parity (non-settled)
-- PASS: zero rows
-- See also: scripts/verify-snapshot-facet-semantics.sql block 4
-- =============================================================================
WITH party AS (
  SELECT customer_id, customer_name, signed_balance, advance_available, net_position
  FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
  WHERE ABS(signed_balance) > 0.01 OR advance_available > 0.01
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
JOIN LATERAL public.get_customer_financial_snapshot(
  p.customer_id,
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
) s ON true
WHERE ABS(p.signed_balance - s.outstanding_dr) > 0.01
   OR ABS(p.net_position - s.net_position) > 0.01
LIMIT 50;


-- =============================================================================
-- GATE D-4) Party vs canonical true outstanding — ELLA NOOR non-settled
-- PASS: zero rows (|drift| > 0.01)
-- See also: scripts/verify-customer-party-balances-parity.sql block 1
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
  public.get_customer_true_outstanding(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) AS canonical_balance,
  ROUND(
    p.signed_balance - public.get_customer_true_outstanding(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid),
    2
  ) AS drift
FROM party p
JOIN public.customers cu ON cu.id = p.customer_id
WHERE ABS(
  p.signed_balance - public.get_customer_true_outstanding(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
) > 0.01
ORDER BY ABS(
  p.signed_balance - public.get_customer_true_outstanding(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
) DESC
LIMIT 50;


-- =============================================================================
-- GATE D-5) Aafra refund-safe spot check (manual — adjust ILIKE pattern)
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
CROSS JOIN LATERAL public.get_customer_financial_snapshot(c.id, c.organization_id) s
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
