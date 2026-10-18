-- purchase_bills SELECT rule: same access (admins and managers of the shop),
-- index-friendly form. The old qual called user_belongs_to_org + has_org_role
-- per row, so every purchase_items read (its rule nests a purchase_bills
-- subquery) seq-scanned all shops' bills: 128 ms of a 129 ms single-bill
-- item fetch on live, 18 Oct 2026. Applied by the user via
-- sql/purchase-bills-rls-speedup-2026-10-18.sql.txt (guarded: changes nothing
-- unless the live rule text matches the old one).

CREATE OR REPLACE FUNCTION public.get_user_admin_manager_org_ids(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = p_user_id
    AND role IN ('admin'::app_role, 'manager'::app_role);
$$;

REVOKE ALL ON FUNCTION public.get_user_admin_manager_org_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_admin_manager_org_ids(uuid) TO authenticated;

DO $$
DECLARE
  v_expected text := regexp_replace(
    '(user_belongs_to_org(( SELECT auth.uid() AS uid), organization_id) AND (has_org_role(( SELECT auth.uid() AS uid), organization_id, ''admin''::app_role) OR has_org_role(( SELECT auth.uid() AS uid), organization_id, ''manager''::app_role)))',
    '\s+', '', 'g');
  v_name text;
  v_count int;
BEGIN
  SELECT count(*), min(policyname)
    INTO v_count, v_name
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'purchase_bills'
    AND cmd IN ('SELECT', 'ALL')
    AND regexp_replace(qual, '\s+', '', 'g') = v_expected;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected 1 purchase_bills rule with the old text, found %. Nothing changed: send me the STEP 1 result.', v_count;
  END IF;

  EXECUTE format(
    'ALTER POLICY %I ON public.purchase_bills USING (organization_id IN (SELECT public.get_user_admin_manager_org_ids((SELECT auth.uid()))))',
    v_name);
  RAISE NOTICE 'Updated rule: %', v_name;
END $$;
