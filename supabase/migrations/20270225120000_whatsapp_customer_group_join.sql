-- Ezzy ERP WhatsApp: after a bill is sent, optionally save the customer's number as a contact on the
-- shop's linked WhatsApp and add it to one WhatsApp group (the linked number must be that group's admin).
-- Off by default. Additive only; send-whatsapp skips the step until these columns exist.

-- 1. Shop settings.
ALTER TABLE public.whatsapp_api_settings ADD COLUMN IF NOT EXISTS builtin_save_contacts boolean NOT NULL DEFAULT false;
ALTER TABLE public.whatsapp_api_settings ADD COLUMN IF NOT EXISTS builtin_group_id text;
ALTER TABLE public.whatsapp_api_settings ADD COLUMN IF NOT EXISTS builtin_group_name text;
-- When the customer's privacy blocks a direct add, send them the group's invite link instead.
ALTER TABLE public.whatsapp_api_settings ADD COLUMN IF NOT EXISTS builtin_group_invite_fallback boolean NOT NULL DEFAULT true;

-- 2. One row per customer number per group (group_id '' = contact save only), so each customer is
-- tried once and never re-added after they leave the group.
CREATE TABLE IF NOT EXISTS public.whatsapp_group_joins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone text NOT NULL,
  group_id text NOT NULL DEFAULT '',
  customer_name text,
  -- saved | skipped | failed
  contact_status text,
  -- pending | added | already | invited | privacy | not_admin | left_recently | full | limit | failed | skipped
  group_status text NOT NULL DEFAULT 'pending',
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, phone, group_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_group_joins_org_created_idx
  ON public.whatsapp_group_joins (organization_id, created_at DESC);

ALTER TABLE public.whatsapp_group_joins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_group_joins_select_org ON public.whatsapp_group_joins;
CREATE POLICY whatsapp_group_joins_select_org ON public.whatsapp_group_joins
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids((select auth.uid()))));

GRANT SELECT ON public.whatsapp_group_joins TO authenticated;
GRANT ALL ON public.whatsapp_group_joins TO service_role;

NOTIFY pgrst, 'reload schema';
