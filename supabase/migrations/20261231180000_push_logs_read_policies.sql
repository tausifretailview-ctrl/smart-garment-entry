-- Customer Notifications page (Reports): let shop staff READ their own org's push
-- delivery log and subscription status. Writes stay with the push-send edge
-- function (service role) and the customer-page RPCs. Additive and idempotent.
--
-- push_messages: a table SELECT policy is fine (no secrets: status, timestamps,
-- error text, FCM message name).
-- push_subscriptions holds fcm_token (a device credential), and RLS is not
-- column-aware, so staff get NO table policy there. They read metadata only
-- through get_org_push_subscriptions(), which never returns the token.
DO $$
BEGIN
  IF to_regclass('public.push_messages') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'push_messages'
         AND policyname = 'org members read push_messages'
     ) THEN
    EXECUTE $p$
      CREATE POLICY "org members read push_messages" ON public.push_messages
        FOR SELECT TO authenticated
        USING (organization_id IN (SELECT public.get_user_organization_ids((select auth.uid()))))
    $p$;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_push_messages_org_created
  ON public.push_messages (organization_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_org_push_subscriptions(p_organization_id uuid)
RETURNS TABLE (
  id uuid,
  customer_phone_last10 text,
  customer_id uuid,
  status text,
  receives_invoices boolean,
  confirmed_at timestamptz,
  created_at timestamptz,
  last_seen_at timestamptz,
  inactive_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id::uuid, s.customer_phone_last10::text, s.customer_id::uuid, s.status::text,
         s.receives_invoices::boolean, s.confirmed_at::timestamptz, s.created_at::timestamptz,
         s.last_seen_at::timestamptz, s.inactive_reason::text
  FROM public.push_subscriptions s
  WHERE s.organization_id = p_organization_id
    AND p_organization_id IN (SELECT public.get_user_organization_ids((select auth.uid())))
  ORDER BY s.created_at DESC
  LIMIT 5000
$$;

REVOKE EXECUTE ON FUNCTION public.get_org_push_subscriptions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_push_subscriptions(uuid) TO authenticated;
