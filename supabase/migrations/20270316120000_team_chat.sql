-- Chat inside one shop: the owner and the shop's users (logins) message each other
-- one to one, in the same right-side "Shop chat" panel as sibling-shop chat
-- (20270311120000_sibling_shop_chat.sql). Only the two people in a conversation
-- can read it. Additive only: no existing table or function changes.

-- 1. Table --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.team_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL,
  recipient_user_id uuid NOT NULL,
  sender_name text,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  reply_to_id uuid REFERENCES public.team_chat_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT team_chat_messages_distinct_users CHECK (sender_user_id <> recipient_user_id)
);

-- One conversation (either direction), newest first.
CREATE INDEX IF NOT EXISTS idx_team_chat_messages_pair_time
  ON public.team_chat_messages (organization_id, sender_user_id, recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_chat_messages_unread
  ON public.team_chat_messages (organization_id, recipient_user_id, sender_user_id)
  WHERE read_at IS NULL;

ALTER TABLE public.team_chat_messages ENABLE ROW LEVEL SECURITY;

-- Read only, and only your own conversations. All writes go through the functions below.
DROP POLICY IF EXISTS "Users read their own team chat" ON public.team_chat_messages;
CREATE POLICY "Users read their own team chat" ON public.team_chat_messages
  FOR SELECT TO authenticated
  USING (
    ((select auth.uid()) = sender_user_id OR (select auth.uid()) = recipient_user_id)
    AND public.user_belongs_to_org((select auth.uid()), organization_id)
  );

REVOKE INSERT, UPDATE, DELETE ON public.team_chat_messages FROM anon, authenticated;
GRANT SELECT ON public.team_chat_messages TO authenticated;

-- Live delivery: realtime sends INSERT/UPDATE to subscribers, filtered by the RLS above.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'team_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_chat_messages;
  END IF;
END $$;

-- 2. People of this shop, with unread count and the latest message ----------------
-- Platform admin logins (EzzyERP support added to a client shop) are left out of
-- the list, unless the caller is one.

CREATE OR REPLACE FUNCTION public.get_team_chat_members(p_organization_id uuid)
RETURNS TABLE (
  user_id uuid,
  name text,
  role text,
  unread integer,
  last_body text,
  last_at timestamptz,
  last_from_me boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH me AS (
    SELECT auth.uid() AS id
    WHERE public.user_belongs_to_org(auth.uid(), p_organization_id)
  ),
  members AS (
    SELECT DISTINCT ON (om.user_id) om.user_id, om.role::text AS role
    FROM public.organization_members om, me
    WHERE om.organization_id = p_organization_id
      AND om.user_id <> me.id
      AND (
        NOT public.has_role(om.user_id, 'platform_admin'::public.app_role)
        OR public.has_role(me.id, 'platform_admin'::public.app_role)
      )
    ORDER BY om.user_id, om.created_at
  )
  SELECT
    m.user_id,
    COALESCE(
      NULLIF(btrim(u.raw_user_meta_data->>'full_name'), ''),
      NULLIF(btrim(u.raw_user_meta_data->>'name'), ''),
      split_part(u.email, '@', 1),
      'User'
    ),
    m.role,
    (
      SELECT count(*)::integer FROM public.team_chat_messages t
      WHERE t.organization_id = p_organization_id
        AND t.recipient_user_id = me.id
        AND t.sender_user_id = m.user_id
        AND t.read_at IS NULL
    ),
    lm.body,
    lm.created_at,
    lm.sender_user_id = me.id
  FROM members m
  CROSS JOIN me
  JOIN auth.users u ON u.id = m.user_id
  LEFT JOIN LATERAL (
    SELECT t.body, t.created_at, t.sender_user_id
    FROM public.team_chat_messages t
    WHERE t.organization_id = p_organization_id
      AND (
        (t.sender_user_id = me.id AND t.recipient_user_id = m.user_id)
        OR (t.sender_user_id = m.user_id AND t.recipient_user_id = me.id)
      )
    ORDER BY t.created_at DESC
    LIMIT 1
  ) lm ON true
  ORDER BY lm.created_at DESC NULLS LAST, (m.role = 'admin') DESC, 2;
$$;

REVOKE ALL ON FUNCTION public.get_team_chat_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_chat_members(uuid) TO authenticated;

-- 3. Send ----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.send_team_chat_message(
  p_organization_id uuid,
  p_recipient_user_id uuid,
  p_body text,
  p_reply_to_id uuid DEFAULT NULL
)
RETURNS public.team_chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_body text := btrim(COALESCE(p_body, ''));
  v_name text;
  v_reply uuid;
  v_row public.team_chat_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT public.user_belongs_to_org(v_uid, p_organization_id) THEN
    RAISE EXCEPTION 'You are not a member of this shop' USING ERRCODE = '42501';
  END IF;
  IF p_recipient_user_id IS NULL OR p_recipient_user_id = v_uid
     OR NOT public.user_belongs_to_org(p_recipient_user_id, p_organization_id) THEN
    RAISE EXCEPTION 'This person is not a user of this shop';
  END IF;
  IF v_body = '' THEN
    RAISE EXCEPTION 'Type a message';
  END IF;
  IF char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'Message is too long (2000 characters max)';
  END IF;

  -- A reply can only point at a message of this same conversation.
  IF p_reply_to_id IS NOT NULL THEN
    SELECT t.id INTO v_reply
    FROM public.team_chat_messages t
    WHERE t.id = p_reply_to_id
      AND t.organization_id = p_organization_id
      AND (
        (t.sender_user_id = v_uid AND t.recipient_user_id = p_recipient_user_id)
        OR (t.sender_user_id = p_recipient_user_id AND t.recipient_user_id = v_uid)
      );
  END IF;

  SELECT COALESCE(
           NULLIF(btrim(u.raw_user_meta_data->>'full_name'), ''),
           NULLIF(btrim(u.raw_user_meta_data->>'name'), ''),
           split_part(u.email, '@', 1)
         )
    INTO v_name
  FROM auth.users u
  WHERE u.id = v_uid;

  INSERT INTO public.team_chat_messages (
    organization_id, sender_user_id, recipient_user_id, sender_name, body, reply_to_id
  )
  VALUES (p_organization_id, v_uid, p_recipient_user_id, v_name, v_body, v_reply)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.send_team_chat_message(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_team_chat_message(uuid, uuid, text, uuid) TO authenticated;

-- 4. Mark a conversation read for the current login -------------------------------

CREATE OR REPLACE FUNCTION public.mark_team_chat_read(
  p_organization_id uuid,
  p_other_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_belongs_to_org(auth.uid(), p_organization_id) THEN
    RAISE EXCEPTION 'You are not a member of this shop' USING ERRCODE = '42501';
  END IF;

  UPDATE public.team_chat_messages
  SET read_at = now()
  WHERE organization_id = p_organization_id
    AND recipient_user_id = auth.uid()
    AND sender_user_id = p_other_user_id
    AND read_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_team_chat_read(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_team_chat_read(uuid, uuid) TO authenticated;
