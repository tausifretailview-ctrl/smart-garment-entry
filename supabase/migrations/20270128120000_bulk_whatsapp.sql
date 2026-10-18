-- Bulk WhatsApp page: campaigns sent from each user's own QR-linked number via wa-gateway.
-- Rows are written only by the bulk-whatsapp edge function (service role); users can read
-- their own campaigns, org admins can read all campaigns of their organization.

CREATE TABLE IF NOT EXISTS public.bulk_whatsapp_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  message text NOT NULL DEFAULT '',
  media_url text,
  media_type text,
  media_name text,
  sender_number text,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'paused', 'stopped', 'completed', 'failed')),
  status_note text,
  total_count int NOT NULL DEFAULT 0,
  sent_count int NOT NULL DEFAULT 0,
  delivered_count int NOT NULL DEFAULT 0,
  read_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS bulk_whatsapp_campaigns_org_created_idx
  ON public.bulk_whatsapp_campaigns (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.bulk_whatsapp_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.bulk_whatsapp_campaigns(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  position int NOT NULL,
  phone text NOT NULL,
  name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'skipped')),
  wa_message_id text,
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS bulk_whatsapp_recipients_campaign_idx
  ON public.bulk_whatsapp_recipients (campaign_id, position);
CREATE INDEX IF NOT EXISTS bulk_whatsapp_recipients_wa_message_idx
  ON public.bulk_whatsapp_recipients (wa_message_id)
  WHERE wa_message_id IS NOT NULL;

ALTER TABLE public.bulk_whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_whatsapp_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bulk_whatsapp_campaigns_select ON public.bulk_whatsapp_campaigns;
CREATE POLICY bulk_whatsapp_campaigns_select ON public.bulk_whatsapp_campaigns
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS bulk_whatsapp_recipients_select ON public.bulk_whatsapp_recipients;
CREATE POLICY bulk_whatsapp_recipients_select ON public.bulk_whatsapp_recipients
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bulk_whatsapp_campaigns c
      WHERE c.id = campaign_id
        AND (c.user_id = auth.uid()
             OR public.has_org_role(auth.uid(), c.organization_id, 'admin'::public.app_role))
    )
  );

GRANT SELECT ON public.bulk_whatsapp_campaigns TO authenticated;
GRANT SELECT ON public.bulk_whatsapp_recipients TO authenticated;

-- Report tiles: delivered includes read, sent includes delivered and read.
CREATE OR REPLACE FUNCTION public.refresh_bulk_whatsapp_counts(p_campaign_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.bulk_whatsapp_campaigns c
  SET sent_count = s.sent,
      delivered_count = s.delivered,
      read_count = s.read_n,
      failed_count = s.failed,
      updated_at = now()
  FROM (
    SELECT
      count(*) FILTER (WHERE status IN ('sent', 'delivered', 'read')) AS sent,
      count(*) FILTER (WHERE status IN ('delivered', 'read')) AS delivered,
      count(*) FILTER (WHERE status = 'read') AS read_n,
      count(*) FILTER (WHERE status = 'failed') AS failed
    FROM public.bulk_whatsapp_recipients
    WHERE campaign_id = p_campaign_id
  ) s
  WHERE c.id = p_campaign_id;
$$;

REVOKE ALL ON FUNCTION public.refresh_bulk_whatsapp_counts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_bulk_whatsapp_counts(uuid) TO service_role;

-- Posters: public read so the WhatsApp server can download them; uploads only into the
-- uploader's own organization folder.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bulk-whatsapp-media', 'bulk-whatsapp-media', true, 16777216,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS bulk_whatsapp_media_read ON storage.objects;
CREATE POLICY bulk_whatsapp_media_read ON storage.objects
  FOR SELECT
  USING (bucket_id = 'bulk-whatsapp-media');

DROP POLICY IF EXISTS bulk_whatsapp_media_insert ON storage.objects;
CREATE POLICY bulk_whatsapp_media_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bulk-whatsapp-media'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text FROM public.organization_members om WHERE om.user_id = auth.uid())
  );
