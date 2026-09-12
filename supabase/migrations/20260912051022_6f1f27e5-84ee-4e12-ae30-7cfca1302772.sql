-- 1. Pin search_path on remaining mutable function
ALTER FUNCTION public.normalize_product_name_key(text) SET search_path = public;

-- 2. Consolidate overlapping organization_members UPDATE policies
DROP POLICY IF EXISTS "Admins can manage members in their organization" ON public.organization_members;
DROP POLICY IF EXISTS "platform_admins_can_update_member_roles" ON public.organization_members;
DROP POLICY IF EXISTS "Org admins can update members" ON public.organization_members;

CREATE POLICY "Org admins can update members"
ON public.organization_members
FOR UPDATE
TO authenticated
USING (
  is_org_admin((SELECT auth.uid()), organization_id)
  AND user_id <> (SELECT auth.uid())
)
WITH CHECK (
  is_org_admin((SELECT auth.uid()), organization_id)
  AND user_id <> (SELECT auth.uid())
  AND role = ANY (ARRAY['user'::app_role, 'manager'::app_role])
);

-- 3. organizations: restrict public-role policies to authenticated
DROP POLICY IF EXISTS "admins_can_update_organizations" ON public.organizations;
CREATE POLICY "admins_can_update_organizations"
ON public.organizations
FOR UPDATE
TO authenticated
USING (
  has_role((SELECT auth.uid()), 'platform_admin'::app_role)
  OR has_org_role((SELECT auth.uid()), id, 'admin'::app_role)
)
WITH CHECK (
  has_role((SELECT auth.uid()), 'platform_admin'::app_role)
  OR has_org_role((SELECT auth.uid()), id, 'admin'::app_role)
);

DROP POLICY IF EXISTS "users_can_select_their_organizations" ON public.organizations;
CREATE POLICY "users_can_select_their_organizations"
ON public.organizations
FOR SELECT
TO authenticated
USING (
  has_role((SELECT auth.uid()), 'platform_admin'::app_role)
  OR id IN (
    SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "platform_admins_can_create_organizations" ON public.organizations;
CREATE POLICY "platform_admins_can_create_organizations"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (has_role((SELECT auth.uid()), 'platform_admin'::app_role));

-- 4. payment_links: restrict to authenticated
DROP POLICY IF EXISTS "Users can create payment links in their organizations" ON public.payment_links;
CREATE POLICY "Users can create payment links in their organizations"
ON public.payment_links FOR INSERT TO authenticated
WITH CHECK (organization_id IN (SELECT get_user_organization_ids((SELECT auth.uid()))));

DROP POLICY IF EXISTS "Users can update payment links in their organizations" ON public.payment_links;
CREATE POLICY "Users can update payment links in their organizations"
ON public.payment_links FOR UPDATE TO authenticated
USING (organization_id IN (SELECT get_user_organization_ids((SELECT auth.uid()))));

DROP POLICY IF EXISTS "Users can view payment links in their organizations" ON public.payment_links;
CREATE POLICY "Users can view payment links in their organizations"
ON public.payment_links FOR SELECT TO authenticated
USING (organization_id IN (SELECT get_user_organization_ids((SELECT auth.uid()))));

-- 5. product_images: restrict to authenticated
DROP POLICY IF EXISTS "Users can view product images for their organization" ON public.product_images;
CREATE POLICY "Users can view product images for their organization"
ON public.product_images FOR SELECT TO authenticated
USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can insert product images for their organization" ON public.product_images;
CREATE POLICY "Users can insert product images for their organization"
ON public.product_images FOR INSERT TO authenticated
WITH CHECK (organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can update product images for their organization" ON public.product_images;
CREATE POLICY "Users can update product images for their organization"
ON public.product_images FOR UPDATE TO authenticated
USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can delete product images for their organization" ON public.product_images;
CREATE POLICY "Users can delete product images for their organization"
ON public.product_images FOR DELETE TO authenticated
USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = (SELECT auth.uid())));