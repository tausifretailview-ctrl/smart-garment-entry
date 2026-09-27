-- SECURITY REVIEW 2026-09-27 · FIX-1: logged-out visitors can only call the functions the
-- login page, public storefront and customer page actually need.
--
-- WHY
--   The 18 Aug 2026 clean-up removed anonymous access only from VOLATILE functions. Older
--   STABLE report functions (trial balance, GST summary, sales/purchase/outstanding summaries,
--   stock value, ...) may still be callable with just the public anon key, which is inside
--   the website's JavaScript. CHECK-1 shows the live list. This script closes all of them.
--
-- WHAT STAYS OPEN TO ANON (unchanged)
--   get_org_public_info, login_attempts_rate_ok, get_public_storefront,
--   submit_public_storefront_enquiry, customer_page_* , push_track,
--   and the RLS helpers has_role, has_org_role, is_org_admin, is_entry_creator_or_admin,
--   user_belongs_to_org, get_user_organization_ids.
--
-- Logged-in users keep exactly the access they have today. Safe to re-run.


CREATE TEMP TABLE _anon_revoked (signature text) ON COMMIT DROP;

DO $fix1$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS sig,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_had
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname NOT IN (
        'get_org_public_info', 'login_attempts_rate_ok', 'get_public_storefront',
        'submit_public_storefront_enquiry', 'push_track',
        'has_role', 'has_org_role', 'is_org_admin', 'is_entry_creator_or_admin',
        'user_belongs_to_org', 'get_user_organization_ids')
      AND p.proname !~ '^customer_page_'
      -- leave extension-owned functions (pg_trgm etc.) alone
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    IF r.auth_had THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    INSERT INTO _anon_revoked VALUES (r.sig::text);
  END LOOP;
END
$fix1$;

