-- Verify snapshot facet semantics after migration 20260822183000_snapshot_facet_semantics.sql
--
-- Run ONE block at a time in Supabase SQL editor. Replace org_id / customer_id as needed.
--
-- Gate: all checks return zero rows or expected identities.

-- =============================================================================
-- 1) Identity: net_position = outstanding_dr (= signed net)
-- =============================================================================
SELECT *
FROM (
  SELECT
    c.customer_name,
    s.outstanding_dr,
    s.net_position,
    ROUND(s.outstanding_dr - s.net_position, 2) AS drift
  FROM public.customers c
  CROSS JOIN LATERAL public.get_customer_financial_snapshot(c.id, c.organization_id) s
  WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND c.deleted_at IS NULL
) x
WHERE ABS(drift) > 0.01
LIMIT 20;


-- =============================================================================
-- 2) Gross facet: gross_outstanding_dr = outstanding_dr + advance_available
--     (Aafra recovery — invoice outstanding before netting unused advance)
-- =============================================================================
SELECT *
FROM (
  SELECT
    c.customer_name,
    s.outstanding_dr,
    s.advance_available,
    s.gross_outstanding_dr,
    ROUND(s.outstanding_dr + GREATEST(s.advance_available, 0) - s.gross_outstanding_dr, 2) AS gross_drift
  FROM public.customers c
  CROSS JOIN LATERAL public.get_customer_financial_snapshot(c.id, c.organization_id) s
  WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND c.deleted_at IS NULL
    AND (ABS(s.outstanding_dr) > 0.01 OR s.advance_available > 0.01)
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
-- 4) Snapshot vs party signed_balance parity (non-settled customers)
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
LIMIT 20;


-- =============================================================================
-- 5) Refund-safe Aafra gate: gross > net when unused advance exists with invoice Dr
--     (manual spot — pick a customer with both invoice Dr and advance pool)
-- =============================================================================
-- Example shape only (adjust name pattern):
-- SELECT * FROM public.get_customer_financial_snapshot(
--   (SELECT id FROM customers WHERE customer_name ILIKE '%aafra%' LIMIT 1),
--   '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
-- );
