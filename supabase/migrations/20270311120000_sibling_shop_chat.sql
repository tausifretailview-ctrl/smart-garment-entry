-- Chat between sibling shops (separate organizations that share an admin login,
-- the same link Stock Transfer uses). Each pair of shops has one conversation;
-- every member of either shop can read it and send into it.
--
-- Chat is opt-in per pair: an admin of BOTH shops turns it on from the chat panel
-- (shop_chat_links). Sharing an admin login alone does not open a chat, so a
-- login that is admin in many unrelated shops never joins their staff together.

-- 1. Tables ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shop_chat_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_a uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  org_b uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shop_chat_links_ordered CHECK (org_a < org_b),
  CONSTRAINT shop_chat_links_pair_key UNIQUE (org_a, org_b)
);

CREATE INDEX IF NOT EXISTS idx_shop_chat_links_org_b ON public.shop_chat_links (org_b);

CREATE TABLE IF NOT EXISTS public.shop_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  to_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sender_user_id uuid,
  sender_name text,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  reply_to_id uuid REFERENCES public.shop_chat_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT shop_chat_messages_distinct_orgs CHECK (from_organization_id <> to_organization_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_chat_messages_pair_time
  ON public.shop_chat_messages (from_organization_id, to_organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_chat_messages_unread
  ON public.shop_chat_messages (to_organization_id, from_organization_id)
  WHERE read_at IS NULL;

ALTER TABLE public.shop_chat_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_chat_messages ENABLE ROW LEVEL SECURITY;

-- Read only. All writes go through the functions below.
DROP POLICY IF EXISTS "Members read their shop chat links" ON public.shop_chat_links;
CREATE POLICY "Members read their shop chat links" ON public.shop_chat_links
  FOR SELECT TO authenticated
  USING (
    public.user_belongs_to_org(auth.uid(), org_a)
    OR public.user_belongs_to_org(auth.uid(), org_b)
  );

DROP POLICY IF EXISTS "Members read their shop chat" ON public.shop_chat_messages;
CREATE POLICY "Members read their shop chat" ON public.shop_chat_messages
  FOR SELECT TO authenticated
  USING (
    public.user_belongs_to_org(auth.uid(), from_organization_id)
    OR public.user_belongs_to_org(auth.uid(), to_organization_id)
  );

REVOKE INSERT, UPDATE, DELETE ON public.shop_chat_links FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.shop_chat_messages FROM anon, authenticated;
GRANT SELECT ON public.shop_chat_links TO authenticated;
GRANT SELECT ON public.shop_chat_messages TO authenticated;

-- Live delivery: realtime sends INSERTs to subscribers, filtered by the RLS above.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'shop_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_chat_messages;
  END IF;
END $$;

-- 2. Helpers -------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.shop_chat_is_linked(p_org1 uuid, p_org2 uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_chat_links
    WHERE org_a = LEAST(p_org1, p_org2) AND org_b = GREATEST(p_org1, p_org2)
  );
$$;

-- Internal: only the functions below call it.
REVOKE ALL ON FUNCTION public.shop_chat_is_linked(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 3. Conversation list for the current shop -----------------------------------
-- One row per linked shop with unread count and the latest message.

CREATE OR REPLACE FUNCTION public.get_shop_chat_threads(p_organization_id uuid)
RETURNS TABLE (
  organization_id uuid,
  name text,
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
  WITH linked AS (
    SELECT CASE WHEN l.org_a = p_organization_id THEN l.org_b ELSE l.org_a END AS other_id
    FROM public.shop_chat_links l
    WHERE (l.org_a = p_organization_id OR l.org_b = p_organization_id)
      AND public.user_belongs_to_org(auth.uid(), p_organization_id)
  )
  SELECT
    o.id,
    o.name,
    (
      SELECT count(*)::integer FROM public.shop_chat_messages m
      WHERE m.to_organization_id = p_organization_id
        AND m.from_organization_id = o.id
        AND m.read_at IS NULL
    ),
    lm.body,
    lm.created_at,
    lm.from_organization_id = p_organization_id
  FROM linked
  JOIN public.organizations o ON o.id = linked.other_id
  LEFT JOIN LATERAL (
    SELECT m.body, m.created_at, m.from_organization_id
    FROM public.shop_chat_messages m
    WHERE (m.from_organization_id = p_organization_id AND m.to_organization_id = o.id)
       OR (m.from_organization_id = o.id AND m.to_organization_id = p_organization_id)
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON true
  WHERE COALESCE(o.is_suspended, false) = false
  ORDER BY lm.created_at DESC NULLS LAST, o.name;
$$;

REVOKE ALL ON FUNCTION public.get_shop_chat_threads(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shop_chat_threads(uuid) TO authenticated;

-- 4. Turn chat on / off between two shops (admin of both) -----------------------

CREATE OR REPLACE FUNCTION public.set_shop_chat_link(
  p_organization_id uuid,
  p_other_organization_id uuid,
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL OR p_other_organization_id IS NULL
     OR p_organization_id = p_other_organization_id THEN
    RAISE EXCEPTION 'Pick a different shop';
  END IF;
  IF NOT public.is_org_admin(v_uid, p_organization_id)
     OR NOT public.is_org_admin(v_uid, p_other_organization_id) THEN
    RAISE EXCEPTION 'Only a login that is admin in both shops can turn chat on or off'
      USING ERRCODE = '42501';
  END IF;

  IF p_enabled THEN
    INSERT INTO public.shop_chat_links (org_a, org_b, created_by)
    VALUES (
      LEAST(p_organization_id, p_other_organization_id),
      GREATEST(p_organization_id, p_other_organization_id),
      v_uid
    )
    ON CONFLICT (org_a, org_b) DO NOTHING;
  ELSE
    -- Old messages stay; the conversation just disappears until turned back on.
    DELETE FROM public.shop_chat_links
    WHERE org_a = LEAST(p_organization_id, p_other_organization_id)
      AND org_b = GREATEST(p_organization_id, p_other_organization_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_shop_chat_link(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_shop_chat_link(uuid, uuid, boolean) TO authenticated;

-- 5. Send ----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.send_shop_chat_message(
  p_from_organization_id uuid,
  p_to_organization_id uuid,
  p_body text,
  p_reply_to_id uuid DEFAULT NULL
)
RETURNS public.shop_chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_body text := btrim(COALESCE(p_body, ''));
  v_name text;
  v_reply uuid;
  v_row public.shop_chat_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT public.user_belongs_to_org(v_uid, p_from_organization_id) THEN
    RAISE EXCEPTION 'You are not a member of this shop' USING ERRCODE = '42501';
  END IF;
  IF NOT public.shop_chat_is_linked(p_from_organization_id, p_to_organization_id) THEN
    RAISE EXCEPTION 'Chat with this shop is turned off';
  END IF;
  IF v_body = '' THEN
    RAISE EXCEPTION 'Type a message';
  END IF;
  IF char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'Message is too long (2000 characters max)';
  END IF;

  -- A reply can only point at a message of this same conversation.
  IF p_reply_to_id IS NOT NULL THEN
    SELECT m.id INTO v_reply
    FROM public.shop_chat_messages m
    WHERE m.id = p_reply_to_id
      AND (
        (m.from_organization_id = p_from_organization_id AND m.to_organization_id = p_to_organization_id)
        OR (m.from_organization_id = p_to_organization_id AND m.to_organization_id = p_from_organization_id)
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

  INSERT INTO public.shop_chat_messages (
    from_organization_id, to_organization_id, sender_user_id, sender_name, body, reply_to_id
  )
  VALUES (p_from_organization_id, p_to_organization_id, v_uid, v_name, v_body, v_reply)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.send_shop_chat_message(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_shop_chat_message(uuid, uuid, text, uuid) TO authenticated;

-- 6. Mark a conversation read for the current shop -----------------------------

CREATE OR REPLACE FUNCTION public.mark_shop_chat_read(
  p_organization_id uuid,
  p_other_organization_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.user_belongs_to_org(auth.uid(), p_organization_id) THEN
    RAISE EXCEPTION 'You are not a member of this shop' USING ERRCODE = '42501';
  END IF;

  UPDATE public.shop_chat_messages
  SET read_at = now()
  WHERE to_organization_id = p_organization_id
    AND from_organization_id = p_other_organization_id
    AND read_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_shop_chat_read(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_shop_chat_read(uuid, uuid) TO authenticated;
