-- Bulk WhatsApp Inbox: customer replies to bulk messages and the shop's answers, one chat per
-- customer number per linked user. Rows are written only by the bulk-whatsapp edge function
-- (service role); users read their own chats, org admins read all chats of their organization.

CREATE TABLE IF NOT EXISTS public.bulk_whatsapp_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  phone text NOT NULL,
  name text,
  tags text[] NOT NULL DEFAULT '{}',
  unread_count int NOT NULL DEFAULT 0,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  last_direction text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, phone)
);

CREATE INDEX IF NOT EXISTS bulk_whatsapp_chats_org_last_idx
  ON public.bulk_whatsapp_chats (organization_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.bulk_whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.bulk_whatsapp_chats(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  body text NOT NULL DEFAULT '',
  media_type text,
  wa_message_id text,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'sent', 'delivered', 'read', 'failed')),
  error text,
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bulk_whatsapp_messages_chat_idx
  ON public.bulk_whatsapp_messages (chat_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS bulk_whatsapp_messages_wa_id_idx
  ON public.bulk_whatsapp_messages (chat_id, wa_message_id)
  WHERE wa_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bulk_whatsapp_messages_wa_lookup_idx
  ON public.bulk_whatsapp_messages (wa_message_id)
  WHERE wa_message_id IS NOT NULL;
-- Reply lookups: which shops this user sent bulk messages to a number from.
CREATE INDEX IF NOT EXISTS bulk_whatsapp_recipients_phone_idx
  ON public.bulk_whatsapp_recipients (phone);

ALTER TABLE public.bulk_whatsapp_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bulk_whatsapp_chats_select ON public.bulk_whatsapp_chats;
CREATE POLICY bulk_whatsapp_chats_select ON public.bulk_whatsapp_chats
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS bulk_whatsapp_messages_select ON public.bulk_whatsapp_messages;
CREATE POLICY bulk_whatsapp_messages_select ON public.bulk_whatsapp_messages
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
  );

GRANT SELECT ON public.bulk_whatsapp_chats TO authenticated;
GRANT SELECT ON public.bulk_whatsapp_messages TO authenticated;
