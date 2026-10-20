-- Platform Admin > WhatsApp Only tab: one row per WhatsApp-only shop with its Bulk WhatsApp activity.
-- Campaign and inbox tables are readable only by the shop's own users, so platform admins read
-- this summary through a SECURITY DEFINER function instead of a wider RLS policy.

CREATE OR REPLACE FUNCTION public.platform_whatsapp_shop_activity()
RETURNS TABLE (
  organization_id uuid,
  campaigns_total bigint,
  campaigns_running bigint,
  last_campaign_at timestamptz,
  last_campaign_name text,
  last_campaign_status text,
  last_sender_number text,
  sent_30d bigint,
  failed_30d bigint,
  chats_total bigint,
  unread_total bigint,
  last_reply_at timestamptz,
  optouts_total bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'platform_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only platform admins can read WhatsApp shop activity';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    COALESCE(c.campaigns_total, 0),
    COALESCE(c.campaigns_running, 0),
    lc.created_at,
    lc.name,
    lc.status,
    lc.sender_number,
    COALESCE(c.sent_30d, 0),
    COALESCE(c.failed_30d, 0),
    COALESCE(ch.chats_total, 0),
    COALESCE(ch.unread_total, 0),
    ch.last_reply_at,
    COALESCE(op.optouts_total, 0)
  FROM public.organizations o
  LEFT JOIN LATERAL (
    SELECT
      count(*) AS campaigns_total,
      count(*) FILTER (WHERE bc.status IN ('running', 'paused')) AS campaigns_running,
      COALESCE(sum(bc.sent_count) FILTER (WHERE bc.created_at >= now() - interval '30 days'), 0)::bigint AS sent_30d,
      COALESCE(sum(bc.failed_count) FILTER (WHERE bc.created_at >= now() - interval '30 days'), 0)::bigint AS failed_30d
    FROM public.bulk_whatsapp_campaigns bc
    WHERE bc.organization_id = o.id
  ) c ON true
  LEFT JOIN LATERAL (
    SELECT bc.created_at, bc.name, bc.status, bc.sender_number
    FROM public.bulk_whatsapp_campaigns bc
    WHERE bc.organization_id = o.id
    ORDER BY bc.created_at DESC
    LIMIT 1
  ) lc ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*) AS chats_total,
      COALESCE(sum(bch.unread_count), 0)::bigint AS unread_total,
      max(bch.last_message_at) FILTER (WHERE bch.last_direction = 'in') AS last_reply_at
    FROM public.bulk_whatsapp_chats bch
    WHERE bch.organization_id = o.id
  ) ch ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS optouts_total
    FROM public.bulk_whatsapp_optouts bo
    WHERE bo.organization_id = o.id
  ) op ON true
  WHERE o.organization_type = 'whatsapp';
END;
$$;

REVOKE ALL ON FUNCTION public.platform_whatsapp_shop_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_whatsapp_shop_activity() TO authenticated;
