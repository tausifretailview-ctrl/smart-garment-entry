-- SECURITY REVIEW 2026-10-20: put back the shop check on database functions re-created in October.
-- Copy of /mnt/project-files/sql/security-reguard-fix-2026-10-20.sql.txt (run by the owner in the SQL editor).
--
-- WHAT IT FIXES
--   Some database functions were re-created in October (stock transfer, product delete,
--   negative stock, customer advances SQL). Re-creating them dropped the 27 Sep shop check and
--   gave every logged-in user EXECUTE again. The worst one: reset_stock_from_transactions(shop id)
--   rewrites stock_qty for every item of the given shop, and any logged-in user of ANY shop
--   could call it with another shop's id (shop ids are public via the login page).
--
-- WHAT IT DOES
--   1. reset_stock_from_transactions: adds one line at the top that checks the caller belongs to
--      that shop (same check as 27 Sep: PERFORM public._assert_org_access(...)). The rest of the
--      live body is kept exactly as it is. Stock Reconciliation in your own shop keeps working.
--   2. Internal helper functions (only ever called from inside other database functions, never
--      from the app): logged-in / logged-out users lose direct EXECUTE. The functions that use
--      them keep working because they run as the database owner.
--      A helper is skipped (and reported) if anything that runs as the user still calls it.
--   Old definitions are saved in public.security_guard_backup_20261020.
--   Any error rolls everything back. Safe to re-run.
--
-- AFTER RUNNING: run security-reguard-check-2026-10-20.sql.txt again. It should return 0 rows,
-- or send the rows it still shows.

CREATE TABLE IF NOT EXISTS public.security_guard_backup_20261020 (
  signature text PRIMARY KEY,
  old_def text NOT NULL,
  new_def text,
  action text NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.security_guard_backup_20261020 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.security_guard_backup_20261020 FROM PUBLIC, anon, authenticated;

DO $guard$
DECLARE
  r record;
  v_def text;
  v_src text;
  v_pos int;
  v_new_src text;
  v_new_def text;
  v_at int;
BEGIN
  IF to_regprocedure('public._assert_org_access(uuid)') IS NULL THEN
    RAISE EXCEPTION '_assert_org_access(uuid) is missing: the 27 Sep guard script was not applied. Stop and send this message.';
  END IF;

  FOR r IN
    SELECT p.oid, p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'reset_stock_from_transactions'
      AND p.prosecdef
      AND p.prosrc !~* '(_assert_org_access|organization_members|get_user_organization_ids|user_belongs_to_org|assert_org_member)'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = r.oid;
    v_pos := regexp_instr(v_src, '(^|\n)[ \t]*BEGIN[ \t]*\r?\n', 1, 1, 1, 'i');
    IF v_pos = 0 THEN
      RAISE EXCEPTION 'No BEGIN line found in %, guard it by hand', r.sig;
    END IF;
    v_new_src := left(v_src, v_pos - 1)
                 || '  PERFORM public._assert_org_access(p_organization_id);' || E'\n'
                 || substr(v_src, v_pos);
    v_at := position(v_src IN v_def);
    IF v_at = 0 THEN
      RAISE EXCEPTION 'Body not found in definition of %, guard it by hand', r.sig;
    END IF;
    v_new_def := overlay(v_def PLACING v_new_src FROM v_at FOR length(v_src));
    INSERT INTO public.security_guard_backup_20261020 (signature, old_def, new_def, action)
    VALUES (r.sig, v_def, v_new_def, 'guarded')
    ON CONFLICT (signature) DO NOTHING;
    EXECUTE v_new_def;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    RAISE NOTICE 'GUARDED %', r.sig;
  END LOOP;
END
$guard$;

DO $revoke$
DECLARE
  r record;
  v_user_caller text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('reconcile_variant_stock_qty', '_get_stock_reconciliation_rows',
                        '_product_has_active_references', '_product_is_orphan',
                        '_stock_movement_is_reversed_purchase_line', '_stock_transfer_net_for_variant',
                        'org_allows_negative_stock', 'recompute_customer_advances_used')
  LOOP
    SELECT string_agg(c.oid::regprocedure::text, ', ') INTO v_user_caller
    FROM pg_proc c JOIN pg_namespace cn ON cn.oid = c.pronamespace
    WHERE cn.nspname = 'public'
      AND NOT c.prosecdef
      AND c.oid <> r.oid
      AND c.prosrc ~* ('\m' || r.proname || '\M');
    IF v_user_caller IS NULL THEN
      SELECT string_agg(pol.tablename || '.' || pol.policyname, ', ') INTO v_user_caller
      FROM pg_policies pol
      WHERE COALESCE(pol.qual, '') ~* ('\m' || r.proname || '\M')
         OR COALESCE(pol.with_check, '') ~* ('\m' || r.proname || '\M');
    END IF;
    IF v_user_caller IS NOT NULL THEN
      RAISE NOTICE 'SKIPPED % (still called as the user by: %)', r.sig, v_user_caller;
      CONTINUE;
    END IF;
    INSERT INTO public.security_guard_backup_20261020 (signature, old_def, action)
    VALUES (r.sig, pg_get_functiondef(r.oid), 'revoked from users')
    ON CONFLICT (signature) DO NOTHING;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    RAISE NOTICE 'REVOKED % from users', r.sig;
  END LOOP;
END
$revoke$;

SELECT signature, action, saved_at FROM public.security_guard_backup_20261020 ORDER BY saved_at;

-- UNDO for one function (only if a screen breaks):
--   guarded one:  SELECT old_def FROM public.security_guard_backup_20261020 WHERE signature = '...';
--                 then run that text.
--   revoked one:  GRANT EXECUTE ON FUNCTION <signature> TO authenticated;
