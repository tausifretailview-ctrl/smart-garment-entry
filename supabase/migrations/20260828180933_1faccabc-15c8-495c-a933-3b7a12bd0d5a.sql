-- 1) search_path on remaining public functions
ALTER FUNCTION public._is_settlement_memo_receipt(text, text) SET search_path = public;
ALTER FUNCTION public._sale_return_remaining_credit_for_balance(numeric, numeric, numeric) SET search_path = public;

-- 2) RLS on leftover snapshot table
ALTER TABLE public.ella_noor_cn_false_positive_restore_20260822_snapshot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ella_noor_cn_false_positive_restore_20260822_snapshot FROM anon, authenticated;
GRANT ALL ON public.ella_noor_cn_false_positive_restore_20260822_snapshot TO service_role;
DROP POLICY IF EXISTS "platform_admins_only_snapshot" ON public.ella_noor_cn_false_positive_restore_20260822_snapshot;
CREATE POLICY "platform_admins_only_snapshot"
  ON public.ella_noor_cn_false_positive_restore_20260822_snapshot
  FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'platform_admin'::app_role))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'platform_admin'::app_role));

-- 3) Retarget PUBLIC-role policies to authenticated on tenant tables whose
--    predicates already depend on auth.uid()
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles = '{public}'
      AND (coalesce(qual,'') || coalesce(with_check,'')) LIKE '%auth.uid()%'
      AND tablename NOT IN (
        'organizations','website_products','website_settings','product_images',
        'website_enquiries','website_enquiry_rate_limits','payment_links','portal_sessions',
        'platform_settings','login_attempts'
      )
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 4) organization_members: org admins may not grant admin/platform-level roles
DROP POLICY IF EXISTS "Admins can manage members in their organization" ON public.organization_members;
CREATE POLICY "Admins can manage members in their organization"
  ON public.organization_members
  FOR UPDATE TO authenticated
  USING (
    public.has_org_role((SELECT auth.uid()), organization_id, 'admin'::app_role)
    AND user_id <> (SELECT auth.uid())
  )
  WITH CHECK (
    public.has_org_role((SELECT auth.uid()), organization_id, 'admin'::app_role)
    AND user_id <> (SELECT auth.uid())
    AND (
      role IN ('user'::app_role, 'manager'::app_role)
      OR public.has_role((SELECT auth.uid()), 'platform_admin'::app_role)
    )
  );

DROP POLICY IF EXISTS "Org admins can update members" ON public.organization_members;
CREATE POLICY "Org admins can update members"
  ON public.organization_members
  FOR UPDATE TO authenticated
  USING (
    public.is_org_admin((SELECT auth.uid()), organization_id)
    AND user_id <> (SELECT auth.uid())
  )
  WITH CHECK (
    public.is_org_admin((SELECT auth.uid()), organization_id)
    AND user_id <> (SELECT auth.uid())
    AND (
      role IN ('user'::app_role, 'manager'::app_role)
      OR public.has_role((SELECT auth.uid()), 'platform_admin'::app_role)
    )
  );