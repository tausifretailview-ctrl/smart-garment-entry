-- SECURITY REVIEW 2026-09-27 · FIX-2: stop one business from reading or changing another
-- business's data through database functions (RPCs).
--
-- WHAT IT DOES
--   Many SECURITY DEFINER functions (they bypass Row Level Security) take an organisation id
--   or a record id and never check that the logged-in user belongs to that organisation.
--   This script adds one line at the top of each such function:
--       PERFORM public._assert_org_access(p_org_id);            -- org id parameters
--       PERFORM public._assert_row_org_access('public.sales', p_sale_id);  -- record ids
--   It edits the LIVE definition (pg_get_functiondef), so it never reverts a hotfix that was
--   applied outside the repo. Nothing else in any function changes.
--
-- WHO STILL PASSES
--   SQL editor, pg_cron, service_role (edge functions): always.
--   Logged-in users: only for organisations they are a member of (platform_admin: all).
--   Anonymous callers: never (the login page / storefront / customer page functions are skipped).
--
-- SAFETY
--   * Any error rolls the whole migration back.
--   * Every original definition is saved in public.security_guard_backup_20260927 first.
--     UNDO for one function:  SELECT old_def FROM public.security_guard_backup_20260927
--                             WHERE signature = '...';  -- then run that text.
--   * Preview first: /mnt/project-files/security-review/FIX-2-PREVIEW.sql (same selection query).


-- ---------------------------------------------------------------------------
-- Guard helpers. A caller passes when:
--   * there is no API role on the request (SQL editor, pg_cron, migrations), or
--     the request uses the service_role key (edge functions, dispatchers); or
--   * the logged-in user is a member of the organisation; or
--   * the logged-in user is a platform_admin.
-- Anyone else (anon, or a user from another organisation) gets error 42501.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._assert_org_access(p_org uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  v_uid uuid := auth.uid();
BEGIN
  IF v_role IS NULL OR v_role = 'service_role' THEN
    RETURN;
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Login required' USING ERRCODE = '42501';
  END IF;
  IF p_org IS NULL THEN
    RETURN;  -- nothing to scope; the function itself filters on organization_id
  END IF;
  IF EXISTS (SELECT 1 FROM public.organization_members om
             WHERE om.user_id = v_uid AND om.organization_id = p_org)
     OR public.has_role(v_uid, 'platform_admin'::app_role) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public._assert_row_org_access(p_table regclass, p_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  IF p_id IS NULL THEN
    RETURN;
  END IF;
  EXECUTE format('SELECT organization_id FROM %s WHERE id = $1', p_table) INTO v_org USING p_id;
  IF v_org IS NULL THEN
    PERFORM public._assert_org_access(NULL);  -- still blocks anon; "not found" is left to the function
    RETURN;
  END IF;
  PERFORM public._assert_org_access(v_org);
END;
$$;

REVOKE ALL ON FUNCTION public._assert_org_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._assert_row_org_access(regclass, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._assert_org_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._assert_row_org_access(regclass, uuid) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.security_guard_backup_20260927 (
  signature text PRIMARY KEY,
  old_def text NOT NULL,
  new_def text NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.security_guard_backup_20260927 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.security_guard_backup_20260927 FROM PUBLIC, anon, authenticated;

CREATE TEMP TABLE _guard_result (signature text, status text) ON COMMIT DROP;

DO $apply$
DECLARE
  r record;
  v_def text;
  v_src text;
  v_new_src text;
  v_new_def text;
  v_pos int;
  v_at int;
  v_lines text;
BEGIN
  FOR r IN
WITH idmap(param, tbl, name_like) AS (
  VALUES
    ('p_organization_id', NULL, NULL), ('p_org_id', NULL, NULL), ('p_org', NULL, NULL),
    ('p_sale_id', 'public.sales', NULL),
    ('p_bill_id', 'public.purchase_bills', NULL),
    ('p_return_id', 'public.purchase_returns', '%purchase_return%'),
    ('p_return_id', 'public.sale_returns', '%sale_return%'),
    ('p_voucher_id', 'public.voucher_entries', NULL),
    ('p_order_id', 'public.sale_orders', NULL),
    ('p_quotation_id', 'public.quotations', NULL),
    ('p_challan_id', 'public.delivery_challans', NULL),
    ('p_product_id', 'public.products', NULL),
    ('p_target_product_id', 'public.products', NULL),
    ('p_source_product_id', 'public.products', NULL),
    ('p_supplier_id', 'public.suppliers', NULL),
    ('p_target_supplier_id', 'public.suppliers', NULL),
    ('p_source_supplier_id', 'public.suppliers', NULL),
    ('p_customer_id', 'public.customers', NULL),
    ('p_variant_id', 'public.product_variants', NULL),
    ('p_advance_id', 'public.customer_advances', NULL),
    ('p_payment_link_id', 'public.payment_links', NULL)
),
fns AS (
  SELECT p.oid, p.proname, l.lanname, p.proargnames, p.proargtypes, p.pronargs, p.prosrc
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND p.prosecdef
    AND l.lanname IN ('plpgsql', 'sql')
    AND p.prosqlbody IS NULL
    AND p.prorettype NOT IN ('trigger'::regtype, 'event_trigger'::regtype)
    AND p.proname !~ '^(has_|is_|user_belongs_to_org$|get_user_organization_ids$|_assert_org_access$|_assert_row_org_access$)'
    AND p.proname NOT IN ('get_org_public_info', 'login_attempts_rate_ok', 'get_public_storefront',
                          'submit_public_storefront_enquiry', 'resolve_organization_by_public_slug')
    AND p.proname !~ '^(customer_page_|push_track$)'
    -- skip functions that the anonymous customer page calls into (live-only functions)
    AND NOT EXISTS (
      SELECT 1 FROM pg_proc a JOIN pg_namespace an ON an.oid = a.pronamespace
      WHERE an.nspname = 'public'
        AND a.proname ~ '^(customer_page_|push_track$)'
        AND a.prosrc ~* ('\m' || p.proname || '\M'))
    -- already checks membership somewhere in its body: leave it alone
    AND p.prosrc !~* '(organization_members|user_belongs_to_org|get_user_organization_ids|has_org_role|is_org_admin|_assert_org_access|_assert_row_org_access)'
),
args AS (
  SELECT f.oid, a.name, a.ord, format_type(f.proargtypes[a.ord - 1], NULL) AS typ
  FROM fns f
  CROSS JOIN LATERAL unnest(f.proargnames[1:f.pronargs]) WITH ORDINALITY AS a(name, ord)
),
guards AS (
  SELECT a.oid, a.ord, a.name, m.tbl
  FROM args a
  JOIN fns f ON f.oid = a.oid
  JOIN idmap m ON m.param = a.name
  WHERE a.typ = 'uuid'
    AND (m.name_like IS NULL OR f.proname LIKE m.name_like)
    AND (m.tbl IS NULL OR EXISTS (
          SELECT 1 FROM pg_attribute att
          WHERE att.attrelid = to_regclass(m.tbl)
            AND att.attname = 'organization_id' AND NOT att.attisdropped))
)
SELECT f.oid,
       f.oid::regprocedure::text AS function_signature,
       f.lanname AS language,
       string_agg(
         CASE WHEN g.tbl IS NULL
              THEN format('public._assert_org_access(%I)', g.name)
              ELSE format('public._assert_row_org_access(%L::regclass, %I)', g.tbl, g.name)
         END, '; ' ORDER BY g.ord) AS guard_calls
FROM fns f
JOIN guards g ON g.oid = f.oid
GROUP BY f.oid, f.lanname
  LOOP
    v_def := pg_get_functiondef(r.oid);
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = r.oid;

    IF r.language = 'plpgsql' THEN
      -- insert right after the first line that is just BEGIN (the top-level block)
      v_pos := regexp_instr(v_src, '(^|\n)[ \t]*BEGIN[ \t]*(--[^\n]*)?\r?\n', 1, 1, 1, 'i');
      IF v_pos = 0 THEN
        INSERT INTO _guard_result VALUES (r.function_signature, 'SKIPPED: no BEGIN line found, guard by hand');
        CONTINUE;
      END IF;
      SELECT string_agg('  PERFORM ' || c || ';', E'\n') INTO v_lines
      FROM unnest(string_to_array(r.guard_calls, '; ')) c;
      v_new_src := left(v_src, v_pos - 1)
                   || '  -- security review 2026-09-27: organisation guard' || E'\n'
                   || v_lines || E'\n'
                   || substr(v_src, v_pos);
    ELSE
      SELECT string_agg('SELECT ' || c || ';', E'\n') INTO v_lines
      FROM unnest(string_to_array(r.guard_calls, '; ')) c;
      v_new_src := E'\n-- security review 2026-09-27: organisation guard\n' || v_lines || E'\n' || v_src;
    END IF;

    v_at := position(v_src IN v_def);
    IF v_at = 0 THEN
      INSERT INTO _guard_result VALUES (r.function_signature, 'SKIPPED: body not found in definition, guard by hand');
      CONTINUE;
    END IF;
    v_new_def := overlay(v_def PLACING v_new_src FROM v_at FOR length(v_src));

    INSERT INTO public.security_guard_backup_20260927 (signature, old_def, new_def)
    VALUES (r.function_signature, v_def, v_new_def)
    ON CONFLICT (signature) DO NOTHING;

    EXECUTE v_new_def;
    INSERT INTO _guard_result VALUES (r.function_signature, 'GUARDED: ' || r.guard_calls);
  END LOOP;
END
$apply$;

