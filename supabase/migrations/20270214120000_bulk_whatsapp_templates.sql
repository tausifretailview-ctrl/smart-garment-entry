-- Bulk WhatsApp saved templates: message text plus an optional poster / video / PDF (already in the
-- bulk-whatsapp-media bucket), picked on the send page instead of typing and uploading again.
-- Everyone in the shop sees the shop's templates; the person who saved one, or an org admin, can delete it.

CREATE TABLE IF NOT EXISTS public.bulk_whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 4000),
  media_url text,
  media_type text,
  media_name text,
  video_quality text CHECK (video_quality IS NULL OR video_quality IN ('small', 'medium', 'original')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (btrim(message) <> '' OR media_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS bulk_whatsapp_templates_org_idx
  ON public.bulk_whatsapp_templates (organization_id, created_at DESC);

ALTER TABLE public.bulk_whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bulk_whatsapp_templates_select ON public.bulk_whatsapp_templates;
CREATE POLICY bulk_whatsapp_templates_select ON public.bulk_whatsapp_templates
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = bulk_whatsapp_templates.organization_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS bulk_whatsapp_templates_insert ON public.bulk_whatsapp_templates;
CREATE POLICY bulk_whatsapp_templates_insert ON public.bulk_whatsapp_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = bulk_whatsapp_templates.organization_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS bulk_whatsapp_templates_delete ON public.bulk_whatsapp_templates;
CREATE POLICY bulk_whatsapp_templates_delete ON public.bulk_whatsapp_templates
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
  );

GRANT SELECT, INSERT, DELETE ON public.bulk_whatsapp_templates TO authenticated;
