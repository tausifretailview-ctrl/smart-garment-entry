CREATE INDEX IF NOT EXISTS idx_org_members_user_id
  ON public.organization_members(user_id);

CREATE INDEX IF NOT EXISTS idx_org_members_org_user
  ON public.organization_members(organization_id, user_id);