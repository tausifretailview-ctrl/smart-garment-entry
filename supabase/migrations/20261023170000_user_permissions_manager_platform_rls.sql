-- User Rights UI allows org admins AND managers (see App.tsx RoleProtectedRoute).
-- RLS previously allowed only org admin, so manager (and platform_admin) saves failed with:
--   "new row violates row-level security policy for table 'user_permissions'"
-- Align write/select manage policy with the UI. Users can still read their own row.

DROP POLICY IF EXISTS "Admins can manage user permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Org admins and managers can manage user permissions" ON public.user_permissions;

CREATE POLICY "Org admins and managers can manage user permissions"
ON public.user_permissions
FOR ALL
USING (
  public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
  OR public.has_org_role(auth.uid(), organization_id, 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'platform_admin'::public.app_role)
)
WITH CHECK (
  public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
  OR public.has_org_role(auth.uid(), organization_id, 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'platform_admin'::public.app_role)
);

-- Keep own-row SELECT (idempotent if already present)
DROP POLICY IF EXISTS "Users can view their own permissions" ON public.user_permissions;
CREATE POLICY "Users can view their own permissions"
ON public.user_permissions
FOR SELECT
USING (user_id = auth.uid());
