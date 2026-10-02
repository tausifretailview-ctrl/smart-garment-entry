-- Customer Notifications page (Reports): let shop staff READ their own org's push
-- messages and subscriptions. Writes stay with the push-send edge function
-- (service role) and the customer-page RPCs. Additive and idempotent.
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

  IF to_regclass('public.push_subscriptions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'push_subscriptions'
         AND policyname = 'org members read push_subscriptions'
     ) THEN
    EXECUTE $p$
      CREATE POLICY "org members read push_subscriptions" ON public.push_subscriptions
        FOR SELECT TO authenticated
        USING (organization_id IN (SELECT public.get_user_organization_ids((select auth.uid()))))
    $p$;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_push_messages_org_created
  ON public.push_messages (organization_id, created_at DESC);
