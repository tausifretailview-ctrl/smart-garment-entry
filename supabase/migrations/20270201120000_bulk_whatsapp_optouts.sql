-- Bulk WhatsApp unsubscribe: a customer who replies STOP to a bulk message is not sent bulk
-- messages from that shop again (START subscribes again). Written only by the bulk-whatsapp
-- edge function (service role); shop members can read their own shop's list.

CREATE TABLE IF NOT EXISTS public.bulk_whatsapp_optouts (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone text NOT NULL,
  source text NOT NULL DEFAULT 'reply',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, phone)
);

ALTER TABLE public.bulk_whatsapp_optouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bulk_whatsapp_optouts_select ON public.bulk_whatsapp_optouts;
CREATE POLICY bulk_whatsapp_optouts_select ON public.bulk_whatsapp_optouts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = bulk_whatsapp_optouts.organization_id
        AND om.user_id = auth.uid()
    )
  );

GRANT SELECT ON public.bulk_whatsapp_optouts TO authenticated;
