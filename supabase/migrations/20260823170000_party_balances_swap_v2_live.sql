-- Wire live party balances to fixed v2 (partial CN remaining credit).
--
-- Symptom: get_customer_party_balances still returns -2800 for Farhaan Fab while
-- frontend canonical math shows -100. Cause: get_customer_party_balances calls
-- _get_customer_party_balances_rows (v1 from 20260911*) which only counts
-- credit_status=pending and ignores credit_available_balance. v2 was fixed in
-- 20260823160000_fix_party_balances_v2_partial_cn.sql but was never swapped live.
--
-- Apply AFTER 20260823160000 (v2 partial-CN fix).

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
  'Party balance rows (live). Delegates to _get_customer_party_balances_rows_v2 '
  '(remaining CN credit via _sale_return_remaining_credit_for_balance).';

REVOKE EXECUTE ON FUNCTION public._get_customer_party_balances_rows(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._get_customer_party_balances_rows(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public._get_customer_party_balances_rows(uuid) TO authenticated, service_role;
