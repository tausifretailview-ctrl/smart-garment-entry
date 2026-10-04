-- merge_products is SECURITY DEFINER: it moves a product's sizes, stock and bill history into
-- another product and soft-deletes the source, bypassing the products UPDATE/DELETE RLS
-- (admin/manager update, admin delete). The 27 Sep organisation guard only checks membership,
-- so any member (e.g. a cashier) could merge. Now a logged-in caller must be an admin or
-- manager of the target product's organisation (or a platform admin).
-- SQL editor / service role (no auth.uid()) keep working.
--
-- Edits the LIVE definition (like 20261231120100) so hotfixes outside the repo are kept.
-- Safe to re-run: skips when the marker is already in the body.

DO $merge_role_guard$
DECLARE
  r record;
  v_def text;
  v_src text;
  v_pos int;
  v_new_src text;
  v_auth_had boolean;
  v_anon_had boolean;
  marker constant text := '-- merge_products role guard 2026-10-03';
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'merge_products'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = r.oid;
    IF position(marker IN v_src) > 0 THEN
      RAISE NOTICE 'merge_products already has the role guard';
      CONTINUE;
    END IF;
    -- right after the first line that is just BEGIN (the top-level block)
    v_pos := regexp_instr(v_src, '(^|\n)[ \t]*BEGIN[ \t]*(--[^\n]*)?\r?\n', 1, 1, 1, 'i');
    IF v_pos = 0 THEN
      RAISE EXCEPTION 'merge_products: no BEGIN line found — add the role guard by hand';
    END IF;
    v_new_src := left(v_src, v_pos - 1)
      || '  ' || marker || E'\n'
      || $guard$  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'platform_admin'::public.app_role)
     AND NOT EXISTS (
       SELECT 1
       FROM public.products gp
       JOIN public.organization_members gm ON gm.organization_id = gp.organization_id
       WHERE gp.id = p_target_product_id
         AND gm.user_id = auth.uid()
         AND gm.role IN ('admin'::public.app_role, 'manager'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Only an admin or manager can merge products' USING ERRCODE = '42501';
  END IF;
$guard$
      || substr(v_src, v_pos);
    IF position(v_src IN v_def) = 0 THEN
      RAISE EXCEPTION 'merge_products: body not found in definition — add the role guard by hand';
    END IF;
    v_auth_had := has_function_privilege('authenticated', r.oid, 'EXECUTE');
    v_anon_had := has_function_privilege('anon', r.oid, 'EXECUTE');
    EXECUTE overlay(v_def PLACING v_new_src FROM position(v_src IN v_def) FOR length(v_src));
    -- CREATE OR REPLACE can re-grant EXECUTE; keep exactly who could call it before.
    IF NOT v_auth_had THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, authenticated', r.oid::regprocedure);
    END IF;
    IF NOT v_anon_had THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.oid::regprocedure);
    END IF;
    RAISE NOTICE 'merge_products: role guard added';
  END LOOP;
END
$merge_role_guard$;
