-- Optimize get_user_organization_ids: mark STABLE so planner caches it per query
CREATE OR REPLACE FUNCTION public.get_user_organization_ids(user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = $1;
$$;

-- Also optimize user_belongs_to_org if it exists
CREATE OR REPLACE FUNCTION public.user_belongs_to_org(user_id UUID, org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = $1 AND organization_id = $2
  );
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_organization_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_org(UUID, UUID) TO authenticated;