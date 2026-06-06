-- Phase 2A: mark RLS helper functions PARALLEL SAFE so Postgres can use parallel plans
-- and cache results within a query. Pure metadata change, no logic change, no policy change.

ALTER FUNCTION public.has_role(uuid, app_role) PARALLEL SAFE;
ALTER FUNCTION public.has_org_role(uuid, uuid, app_role) PARALLEL SAFE;
ALTER FUNCTION public.is_org_admin(uuid, uuid) PARALLEL SAFE;
ALTER FUNCTION public.user_belongs_to_org(uuid, uuid) PARALLEL SAFE;
ALTER FUNCTION public.get_user_organization_ids(uuid) PARALLEL SAFE;

-- Phase 2B: one missing composite index for WhatsApp dashboards (org + recent).
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_org_created
  ON public.whatsapp_logs (organization_id, created_at DESC);