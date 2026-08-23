-- ⚠️  DO NOT APPLY until parity and performance gates pass.
--
-- Prerequisites (run in Lovable SQL editor after 20260823140000_party_balances_rows_v2.sql):
--   1. scripts/party-balances-parity.sql — zero diff rows on all 5 required orgs
--   2. EXPLAIN (ANALYZE, BUFFERS) on v2 — buffer count drop ≥10× vs baseline
--   3. pg_get_functiondef confirms v2 body matches this migration's intent
--
-- See docs/party-balances-perf-rewrite-2026-08.md for baseline numbers and gate checklist.

CREATE OR REPLACE FUNCTION public._get_customer_party_balances_rows(p_organization_id uuid)
RETURNS TABLE (
  out_customer_id uuid,
  out_customer_name text,
  out_signed_balance numeric,
  out_advance_available numeric,
  out_direction text,
  out_net_position numeric,
  out_total_dr numeric,
  out_total_cr numeric,
  out_net_receivable numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM public._get_customer_party_balances_rows_v2(p_organization_id);
$$;

COMMENT ON FUNCTION public._get_customer_party_balances_rows(uuid) IS
  'Party balance rows (live). Delegates to _get_customer_party_balances_rows_v2 after perf swap.';

-- Optional cleanup after swap verified in production (separate migration, not bundled here):
-- DROP FUNCTION IF EXISTS public._get_customer_party_balances_rows_v2(uuid);
