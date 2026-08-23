-- Verify snapshot facet semantics after migration 20260822183000_snapshot_facet_semantics.sql
--
-- Run ONE block at a time in Supabase SQL editor. Replace org_id as needed.
--
-- AUTH: Per-customer get_customer_financial_snapshot fails in SQL editor
-- ("Authentication required" via assert_org_member). Use get_customer_financial_snapshot_all
-- blocks (SQL-editor safe) unless running with an org-member JWT.

-- =============================================================================
-- 1) Identity: net_position = outstanding_dr (= signed net) — SQL editor safe
-- =============================================================================
SELECT *
FROM (
  SELECT
    c.customer_name,
    s.outstanding_dr,
    s.net_position,
    ROUND(s.outstanding_dr - s.net_position, 2) AS drift
  FROM public.get_customer_financial_snapshot_all('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) s
  JOIN public.customers c ON c.id = s.customer_id AND c.deleted_at IS NULL
) x
WHERE ABS(drift) > 0.01
LIMIT 20;


-- =============================================================================
-- 2) Gross facet: gross_outstanding_dr = outstanding_dr + advance_available
--     (Aafra recovery — invoice outstanding before netting unused advance)
--     SQL editor safe
-- =============================================================================
SELECT *
FROM (
  SELECT
    c.customer_name,
    s.outstanding_dr,
    s.advance_available,
    s.gross_outstanding_dr,
    ROUND(s.outstanding_dr + GREATEST(s.advance_available, 0) - s.gross_outstanding_dr, 2) AS gross_drift
  FROM public.get_customer_financial_snapshot_all('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) s
  JOIN public.customers c ON c.id = s.customer_id AND c.deleted_at IS NULL
  WHERE ABS(s.outstanding_dr) > 0.01 OR s.advance_available > 0.01
) x
WHERE ABS(gross_drift) > 0.01
LIMIT 20;


-- =============================================================================
-- 3) Party net_position fix: net_position = signed_balance (NOT signed − advance)
-- =============================================================================
SELECT
  customer_name,
  signed_balance,
  advance_available,
  net_position,
  ROUND(signed_balance - net_position, 2) AS net_drift,
  ROUND(signed_balance + advance_available, 2) AS implied_gross_outstanding
FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
WHERE ABS(signed_balance - net_position) > 0.01
LIMIT 20;


-- =============================================================================
-- 4) Snapshot_all vs party signed_balance parity (non-settled customers)
--     SQL editor safe (replaces per-customer get_customer_financial_snapshot)
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
  ROUND(p.net_position - s.net_position, 2) AS net_drift
FROM party p
JOIN snap s ON s.customer_id = p.customer_id
WHERE ABS(p.signed_balance - s.outstanding_dr) > 0.01
   OR ABS(p.net_position - s.net_position) > 0.01
LIMIT 20;


-- =============================================================================
-- 5) Refund-safe Aafra gate — SQL editor safe
-- =============================================================================
SELECT
  c.customer_name,
  s.outstanding_dr,
  s.net_position,
  s.advance_available,
  s.gross_outstanding_dr
FROM public.customers c
JOIN public.get_customer_financial_snapshot_all('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) s
  ON s.customer_id = c.id
WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND c.deleted_at IS NULL
  AND c.customer_name ILIKE '%aafra%';
