-- Notifications page (owner alert history): keep each owner alert's text and tap
-- data, and who has read it. Additive only; the app and the owner-alerts function
-- work before this runs (old rows get their text rebuilt in the app, read marks stay
-- on the device until owner_alert_reads exists).

-- 1. Alert text + tap data, written by owner-alerts after sending.
ALTER TABLE public.owner_push_log ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.owner_push_log ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE public.owner_push_log ADD COLUMN IF NOT EXISTS data jsonb;

-- Newest-first list per shop.
CREATE INDEX IF NOT EXISTS owner_push_log_org_created_idx
  ON public.owner_push_log (organization_id, created_at DESC);

-- 2. Read marks, one row per alert per login (same on phone and Windows app).
CREATE TABLE IF NOT EXISTS public.owner_alert_reads (
  log_id uuid NOT NULL REFERENCES public.owner_push_log(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (log_id, user_id)
);

CREATE INDEX IF NOT EXISTS owner_alert_reads_user_idx
  ON public.owner_alert_reads (user_id, organization_id);

ALTER TABLE public.owner_alert_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_alert_reads_select_own ON public.owner_alert_reads;
CREATE POLICY owner_alert_reads_select_own ON public.owner_alert_reads
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS owner_alert_reads_insert_own ON public.owner_alert_reads;
CREATE POLICY owner_alert_reads_insert_own ON public.owner_alert_reads
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND organization_id IN (SELECT public.get_user_organization_ids((select auth.uid())))
    AND EXISTS (
      SELECT 1 FROM public.owner_push_log l
      WHERE l.id = log_id AND l.organization_id = owner_alert_reads.organization_id
    )
  );

DROP POLICY IF EXISTS owner_alert_reads_delete_own ON public.owner_alert_reads;
CREATE POLICY owner_alert_reads_delete_own ON public.owner_alert_reads
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

GRANT SELECT, INSERT, DELETE ON public.owner_alert_reads TO authenticated;
GRANT ALL ON public.owner_alert_reads TO service_role;

NOTIFY pgrst, 'reload schema';
