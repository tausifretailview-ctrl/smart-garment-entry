-- Customer Balances / Customer Outstanding / payment picker load every customer's balance
-- through get_customer_party_balances, paged 1000 rows at a time (PostgREST max_rows).
-- Each page re-runs the whole set-based query (every customer, every sale item of the
-- org), so a 7,800-customer shop computed all balances 8 times, one page after another.
--
-- get_customer_party_balances_all returns the same rows, in the same order, as one jsonb
-- array: one computation, one round trip. It calls the public wrapper, so the wrapper's
-- organisation check still applies. The app falls back to paging while this function
-- is not applied.

CREATE OR REPLACE FUNCTION public.get_customer_party_balances_all(
  p_organization_id uuid,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'customer_id', r.customer_id,
        'customer_name', r.customer_name,
        'signed_balance', r.signed_balance,
        'advance_available', r.advance_available,
        'direction', r.direction,
        'net_position', r.net_position,
        'total_dr', r.total_dr,
        'total_cr', r.total_cr,
        'net_receivable', r.net_receivable
      )
      ORDER BY r.ord
    ),
    '[]'::jsonb
  )
  FROM public.get_customer_party_balances(p_organization_id, p_search)
    WITH ORDINALITY AS r(
      customer_id,
      customer_name,
      signed_balance,
      advance_available,
      direction,
      net_position,
      total_dr,
      total_cr,
      net_receivable,
      ord
    );
$$;

COMMENT ON FUNCTION public.get_customer_party_balances_all(uuid, text) IS
  'All get_customer_party_balances rows as one jsonb array (no 1000-row paging).';

REVOKE ALL ON FUNCTION public.get_customer_party_balances_all(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_party_balances_all(uuid, text) TO authenticated, service_role;
