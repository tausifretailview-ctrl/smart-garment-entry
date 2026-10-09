-- New customer review alerts.
--
-- 1. Live alerts in the ERP and PWA (src/components/CustomerReviewNotifier.tsx).
--    Realtime only delivers INSERTs for tables in the supabase_realtime
--    publication; row access is still enforced by customer_feedback's existing
--    RLS (org members read their own shop's reviews), so each shop only hears
--    about its own rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'customer_feedback'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_feedback;
  END IF;
END $$;

-- 2. Owner phone alerts (owner-alerts cron) log each review once as kind 'review'.
--    Drops the kind CHECK whatever its name, then adds it back with 'review'.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.owner_push_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%kind%'
  LOOP
    EXECUTE format('ALTER TABLE public.owner_push_log DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.owner_push_log
  ADD CONSTRAINT owner_push_log_kind_check
  CHECK (kind IN ('cashier', 'low_stock', 'day_end', 'invoice', 'test', 'review'));
