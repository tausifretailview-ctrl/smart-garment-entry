-- WhatsApp Logs > "All shops health" tab for support staff, without Platform Admin access.
-- Only shops listed in whatsapp_health_viewer_orgs (DEMO) can use it, and only their
-- Admin / Manager logins. The list is changed by SQL only: the table has RLS on and no
-- policies, so no app user can add their own shop to it. Read-only: shop name, send
-- provider, Ezzy ERP WhatsApp link status and day-wise message counts. No customer data.

CREATE TABLE IF NOT EXISTS public.whatsapp_health_viewer_orgs (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_health_viewer_orgs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_health_viewer_orgs FROM anon, authenticated;

-- Used by the whatsapp-gateway-proxy edge function (service role) for the link alerts.
CREATE OR REPLACE FUNCTION public.can_view_all_whatsapp_health(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id IS NOT NULL AND _org_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.whatsapp_health_viewer_orgs v WHERE v.organization_id = _org_id)
    AND EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.user_id = _user_id AND m.organization_id = _org_id
        AND m.role::text IN ('admin', 'manager')
    );
$$;
REVOKE ALL ON FUNCTION public.can_view_all_whatsapp_health(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_all_whatsapp_health(uuid, uuid) TO service_role;

-- The page asks this to decide whether to show the tab.
CREATE OR REPLACE FUNCTION public.whatsapp_health_viewer(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.whatsapp_health_viewer_orgs v WHERE v.organization_id = p_organization_id)
    AND EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.user_id = auth.uid() AND m.organization_id = p_organization_id
        AND m.role::text IN ('admin', 'manager')
    );
$$;
REVOKE ALL ON FUNCTION public.whatsapp_health_viewer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_health_viewer(uuid) TO authenticated;

-- One row per shop that has WhatsApp settings or sent anything on p_date (India date).
-- last_ok_at / last_failed_at / last_error look at the detailed logs (kept 2 days).
CREATE OR REPLACE FUNCTION public.get_all_shops_whatsapp_health(p_organization_id uuid, p_date date DEFAULT NULL)
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  send_provider text,
  integration_on boolean,
  builtin_status text,
  builtin_status_at timestamptz,
  builtin_number text,
  total_count bigint,
  sent_count bigint,
  delivered_count bigint,
  read_count bigint,
  failed_count bigint,
  pending_count bigint,
  last_ok_at timestamptz,
  last_failed_at timestamptz,
  last_error text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_day date := COALESCE(p_date, (now() AT TIME ZONE 'Asia/Kolkata')::date);
BEGIN
  IF auth.uid() IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.whatsapp_health_viewer_orgs v WHERE v.organization_id = p_organization_id)
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members m
       WHERE m.user_id = auth.uid() AND m.organization_id = p_organization_id
         AND m.role::text IN ('admin', 'manager')
     ) THEN
    RAISE EXCEPTION 'Not allowed to view WhatsApp health of all shops';
  END IF;

  RETURN QUERY
  WITH day_stats AS (
    SELECT s.organization_id AS org_id,
           SUM(s.total_count)::bigint AS total_count,
           SUM(s.sent_count)::bigint AS sent_count,
           SUM(s.delivered_count)::bigint AS delivered_count,
           SUM(s.read_count)::bigint AS read_count,
           SUM(s.failed_count)::bigint AS failed_count,
           SUM(s.pending_count)::bigint AS pending_count
    FROM public.whatsapp_message_stats s
    WHERE s.stat_date = v_day
    GROUP BY s.organization_id
  ), last_ok AS (
    SELECT l.organization_id AS org_id, MAX(COALESCE(l.sent_at, l.created_at)) AS at
    FROM public.whatsapp_logs l
    WHERE l.status IN ('sent', 'delivered', 'read')
      AND l.created_at >= now() - interval '3 days'
    GROUP BY l.organization_id
  ), last_fail AS (
    SELECT DISTINCT ON (l.organization_id) l.organization_id AS org_id, l.created_at AS at, l.error_message
    FROM public.whatsapp_logs l
    WHERE l.status = 'failed'
      AND l.created_at >= now() - interval '3 days'
    ORDER BY l.organization_id, l.created_at DESC
  ), orgs AS (
    SELECT w.organization_id AS org_id FROM public.whatsapp_api_settings w
    UNION
    SELECT d.org_id FROM day_stats d
  )
  SELECT o.id,
         o.name::text,
         w.send_provider::text,
         COALESCE(w.is_active, false),
         w.builtin_status::text,
         w.builtin_status_at,
         w.builtin_connected_number::text,
         COALESCE(d.total_count, 0),
         COALESCE(d.sent_count, 0),
         COALESCE(d.delivered_count, 0),
         COALESCE(d.read_count, 0),
         COALESCE(d.failed_count, 0),
         COALESCE(d.pending_count, 0),
         lo.at,
         lf.at,
         left(lf.error_message, 300)
  FROM orgs x
  JOIN public.organizations o ON o.id = x.org_id
  LEFT JOIN public.whatsapp_api_settings w ON w.organization_id = x.org_id
  LEFT JOIN day_stats d ON d.org_id = x.org_id
  LEFT JOIN last_ok lo ON lo.org_id = x.org_id
  LEFT JOIN last_fail lf ON lf.org_id = x.org_id
  ORDER BY COALESCE(d.total_count, 0) DESC, o.name;
END;
$$;
REVOKE ALL ON FUNCTION public.get_all_shops_whatsapp_health(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_shops_whatsapp_health(uuid, date) TO authenticated;
