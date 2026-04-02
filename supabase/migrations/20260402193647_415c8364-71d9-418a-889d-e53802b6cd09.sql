-- Allow all org members (not just admins) to read whatsapp_api_settings
-- This is needed so non-admin POS users can trigger WhatsApp auto-send after sale

DROP POLICY IF EXISTS "Admins can view whatsapp settings" ON public.whatsapp_api_settings;

CREATE POLICY "Org members can view whatsapp settings"
ON public.whatsapp_api_settings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_members.user_id = auth.uid()
      AND organization_members.organization_id = whatsapp_api_settings.organization_id
  )
);