-- Sales dashboard search: let the text search use its indexes.
--
-- The Sales dashboard searches bill number, customer name, phone and salesman with
-- ILIKE '%text%'. The four (organization_id, column) trigram indexes exist for it
-- (20270120120000), but a logged-in user reads public.sales through Row Level Security, and
-- Postgres may not use a non-leakproof operator (ILIKE) as an index condition there. So every
-- search read ALL of the shop's bills and tested each one: about 500 ms per search on live
-- (pg_stat_statements, 19 Oct - 27 Nov 2026: 134,000 searches), and the indexes sat idle
-- (customer_name: 109 scans; the salesman one was used 74,000 times, as a plain "this shop"
-- filter). On a 50,000-bill shop in a test database: 67 ms through RLS, 1.5 ms here.
--
-- This function checks the caller's shop itself (so it can skip RLS) and returns the ids of
-- the bills whose header matches, up to p_limit. The app asks for one more than it can use:
-- a full page means "too many matches", and it then keeps the old search, which is quick in
-- exactly that case (it stops after the newest 50). With fewer, it lists those ids and applies
-- every other filter on top, so the rows shown are the same as before.
--
-- Read-only, additive: no data or other function changes. Safe to re-run.
-- UNDO: DROP FUNCTION public.search_sales_header_ids(uuid, text, text[], timestamptz, timestamptz, int, boolean);
--       (the app then falls back to the old search by itself).

CREATE OR REPLACE FUNCTION public.search_sales_header_ids(
  p_org_id uuid,
  p_search text,
  p_sale_types text[],
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_limit int DEFAULT 151,
  p_with_salesman boolean DEFAULT true
)
RETURNS TABLE(sale_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_q text := btrim(COALESCE(p_search, ''));
  v_pat text;
  v_limit int := GREATEST(COALESCE(p_limit, 151), 1);
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;
  IF p_sale_types IS NULL OR cardinality(p_sale_types) = 0 THEN
    RAISE EXCEPTION 'p_sale_types is required';
  END IF;
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF auth.role() = 'authenticated' AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  IF v_q = '' THEN
    RETURN;
  END IF;
  -- Same pattern the REST filter builds: '*' is its wildcard.
  v_pat := '%' || replace(v_q, '*', '%') || '%';

  IF p_with_salesman THEN
    RETURN QUERY
    SELECT s.id
    FROM public.sales s
    WHERE s.organization_id = p_org_id
      AND s.deleted_at IS NULL
      AND s.sale_type = ANY (p_sale_types)
      AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
      AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
      AND (
        s.sale_number ILIKE v_pat
        OR s.customer_name ILIKE v_pat
        OR s.customer_phone ILIKE v_pat
        OR s.salesman ILIKE v_pat
      )
    LIMIT v_limit;
  ELSE
    RETURN QUERY
    SELECT s.id
    FROM public.sales s
    WHERE s.organization_id = p_org_id
      AND s.deleted_at IS NULL
      AND s.sale_type = ANY (p_sale_types)
      AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
      AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
      AND (
        s.sale_number ILIKE v_pat
        OR s.customer_name ILIKE v_pat
        OR s.customer_phone ILIKE v_pat
      )
    LIMIT v_limit;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.search_sales_header_ids(uuid, text, text[], timestamptz, timestamptz, int, boolean) IS
  'Ids of a shop''s bills whose number, customer name, phone (and salesman) contain the text, up to p_limit. Checks shop membership itself so the trigram indexes can be used (RLS blocks them for ILIKE).';

REVOKE ALL ON FUNCTION public.search_sales_header_ids(uuid, text, text[], timestamptz, timestamptz, int, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_sales_header_ids(uuid, text, text[], timestamptz, timestamptz, int, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_sales_header_ids(uuid, text, text[], timestamptz, timestamptz, int, boolean) TO authenticated, service_role;

-- Check (read-only): one row, both true.
-- SELECT has_function_privilege('authenticated', 'public.search_sales_header_ids(uuid, text, text[], timestamptz, timestamptz, int, boolean)', 'EXECUTE') AS signed_in_users_can_run,
--        NOT has_function_privilege('anon', 'public.search_sales_header_ids(uuid, text, text[], timestamptz, timestamptz, int, boolean)', 'EXECUTE') AS closed_to_public;
