-- Platform Admin > WhatsApp Logs: org-wise stats that add up, by date range, plus a
-- message balance (credits) per shop for Ezzy ERP WhatsApp (send_provider 'builtin').
--
-- Stats were counted twice: the insert trigger already puts every log into
-- whatsapp_message_stats, yet get_org_whatsapp_stats added the live whatsapp_logs on top,
-- and "Cleanup Old Logs" added the deleted logs a second time. Status columns only ever
-- saw the insert status ('pending'), so Delivered/Read never moved. Now the stats table
-- is the one source: insert counts the row, a status change moves it between columns,
-- cleanup only deletes. New days are India dates (shops are in India; DATE() was UTC,
-- so 00:00-05:30 IST sends landed on the previous day).

-- 0) Repair existing rows before the new triggers run (backup kept). Days that were
-- cleaned up (status columns other than pending > 0) held each message twice: halve them.
-- Days whose logs are still live are rebuilt from those logs. Old rows keep their UTC date.
CREATE TABLE IF NOT EXISTS public.whatsapp_message_stats_backup_20261022 AS
  SELECT * FROM public.whatsapp_message_stats;

WITH live AS (
  SELECT organization_id, DATE(created_at) AS stat_date,
         count(*)::int AS l_total,
         count(*) FILTER (WHERE status = 'sent')::int AS l_sent,
         count(*) FILTER (WHERE status = 'delivered')::int AS l_delivered,
         count(*) FILTER (WHERE status = 'read')::int AS l_read,
         count(*) FILTER (WHERE status = 'failed')::int AS l_failed,
         count(*) FILTER (WHERE status = 'pending')::int AS l_pending
  FROM public.whatsapp_logs
  GROUP BY 1, 2
), base AS (
  SELECT s.*, COALESCE(l.l_total,0) l_total, COALESCE(l.l_sent,0) l_sent, COALESCE(l.l_delivered,0) l_delivered,
         COALESCE(l.l_read,0) l_read, COALESCE(l.l_failed,0) l_failed, COALESCE(l.l_pending,0) l_pending,
         (s.sent_count + s.delivered_count + s.read_count + s.failed_count) > 0 AS cleaned
  FROM public.whatsapp_message_stats s
  LEFT JOIN live l ON l.organization_id = s.organization_id AND l.stat_date = s.stat_date
), c AS (
  SELECT b.*, CASE WHEN cleaned THEN GREATEST(0, (total_count - l_total) / 2) ELSE 0 END AS c_total FROM base b
), c2 AS (
  SELECT c.*, LEAST(sent_count, c_total) AS c_sent FROM c
), c3 AS (
  SELECT c2.*, LEAST(delivered_count, c_total - c_sent) AS c_delivered FROM c2
), c4 AS (
  SELECT c3.*, LEAST(read_count, c_total - c_sent - c_delivered) AS c_read FROM c3
), c5 AS (
  SELECT c4.*, LEAST(failed_count, c_total - c_sent - c_delivered - c_read) AS c_failed FROM c4
), fixed AS (
  SELECT id,
    CASE WHEN cleaned THEN c_total + l_total ELSE GREATEST(total_count, l_total) END AS new_total,
    CASE WHEN cleaned THEN c_sent + l_sent ELSE l_sent END AS new_sent,
    CASE WHEN cleaned THEN c_delivered + l_delivered ELSE l_delivered END AS new_delivered,
    CASE WHEN cleaned THEN c_read + l_read ELSE l_read END AS new_read,
    CASE WHEN cleaned THEN c_failed + l_failed ELSE l_failed END AS new_failed,
    CASE WHEN cleaned THEN (c_total - c_sent - c_delivered - c_read - c_failed) + l_pending
         ELSE l_pending + GREATEST(0, total_count - l_total) END AS new_pending
  FROM c5
)
UPDATE public.whatsapp_message_stats s
SET total_count = f.new_total, sent_count = f.new_sent, delivered_count = f.new_delivered,
    read_count = f.new_read, failed_count = f.new_failed, pending_count = f.new_pending,
    updated_at = now()
FROM fixed f
WHERE f.id = s.id;

-- 1a) Count each new log on its India date.
CREATE OR REPLACE FUNCTION public.update_whatsapp_stats_on_log_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO whatsapp_message_stats (
    organization_id, stat_date, total_count,
    sent_count, delivered_count, read_count, failed_count, pending_count
  )
  VALUES (
    NEW.organization_id,
    (NEW.created_at AT TIME ZONE 'Asia/Kolkata')::date,
    1,
    CASE WHEN NEW.status = 'sent' THEN 1 ELSE 0 END,
    CASE WHEN NEW.status = 'delivered' THEN 1 ELSE 0 END,
    CASE WHEN NEW.status = 'read' THEN 1 ELSE 0 END,
    CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
    CASE WHEN NEW.status = 'pending' THEN 1 ELSE 0 END
  )
  ON CONFLICT (organization_id, stat_date)
  DO UPDATE SET
    total_count = whatsapp_message_stats.total_count + 1,
    sent_count = whatsapp_message_stats.sent_count + CASE WHEN NEW.status = 'sent' THEN 1 ELSE 0 END,
    delivered_count = whatsapp_message_stats.delivered_count + CASE WHEN NEW.status = 'delivered' THEN 1 ELSE 0 END,
    read_count = whatsapp_message_stats.read_count + CASE WHEN NEW.status = 'read' THEN 1 ELSE 0 END,
    failed_count = whatsapp_message_stats.failed_count + CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
    pending_count = whatsapp_message_stats.pending_count + CASE WHEN NEW.status = 'pending' THEN 1 ELSE 0 END,
    updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 1b) Move a log between status columns when its status changes.
CREATE OR REPLACE FUNCTION public.update_whatsapp_stats_on_log_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  UPDATE whatsapp_message_stats SET
    sent_count = GREATEST(0, sent_count
      + CASE WHEN NEW.status = 'sent' THEN 1 ELSE 0 END
      - CASE WHEN OLD.status = 'sent' THEN 1 ELSE 0 END),
    delivered_count = GREATEST(0, delivered_count
      + CASE WHEN NEW.status = 'delivered' THEN 1 ELSE 0 END
      - CASE WHEN OLD.status = 'delivered' THEN 1 ELSE 0 END),
    read_count = GREATEST(0, read_count
      + CASE WHEN NEW.status = 'read' THEN 1 ELSE 0 END
      - CASE WHEN OLD.status = 'read' THEN 1 ELSE 0 END),
    failed_count = GREATEST(0, failed_count
      + CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END
      - CASE WHEN OLD.status = 'failed' THEN 1 ELSE 0 END),
    pending_count = GREATEST(0, pending_count
      + CASE WHEN NEW.status = 'pending' THEN 1 ELSE 0 END
      - CASE WHEN OLD.status = 'pending' THEN 1 ELSE 0 END),
    updated_at = NOW()
  WHERE organization_id = NEW.organization_id
    AND stat_date = (NEW.created_at AT TIME ZONE 'Asia/Kolkata')::date;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'whatsapp stats status move failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.update_whatsapp_stats_on_log_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_update_whatsapp_stats_status ON public.whatsapp_logs;
CREATE TRIGGER trigger_update_whatsapp_stats_status
  AFTER UPDATE OF status ON public.whatsapp_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_whatsapp_stats_on_log_status_change();

-- 2) Cleanup only deletes; every log is already in the stats table.
CREATE OR REPLACE FUNCTION public.aggregate_and_cleanup_whatsapp_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Scheduled job (postgres, no JWT) and service_role may run it; any app user must be platform admin.
  IF COALESCE(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin')
     AND NOT public.has_role(auth.uid(), 'platform_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only platform admins can clean up WhatsApp logs';
  END IF;

  DELETE FROM whatsapp_logs WHERE created_at < NOW() - INTERVAL '2 days';
END;
$$;

-- 3) Org-wise stats for a date range, from the stats table only (one row per org per day).
CREATE OR REPLACE FUNCTION public.get_org_whatsapp_stats(p_start_date DATE DEFAULT NULL, p_end_date DATE DEFAULT NULL)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  total_count BIGINT,
  sent_count BIGINT,
  delivered_count BIGINT,
  read_count BIGINT,
  failed_count BIGINT,
  pending_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'platform_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only platform admins can view WhatsApp stats for all organizations';
  END IF;

  RETURN QUERY
  SELECT
    s.organization_id,
    o.name::text AS organization_name,
    SUM(s.total_count)::bigint,
    SUM(s.sent_count)::bigint,
    SUM(s.delivered_count)::bigint,
    SUM(s.read_count)::bigint,
    SUM(s.failed_count)::bigint,
    SUM(s.pending_count)::bigint
  FROM whatsapp_message_stats s
  JOIN organizations o ON o.id = s.organization_id
  WHERE (p_start_date IS NULL OR s.stat_date >= p_start_date)
    AND (p_end_date IS NULL OR s.stat_date <= p_end_date)
  GROUP BY s.organization_id, o.name
  HAVING SUM(s.total_count) > 0
  ORDER BY SUM(s.total_count) DESC;
END;
$$;

-- 4) Message balance per shop (Ezzy ERP WhatsApp). No row = unlimited (shop not on credits).
CREATE TABLE IF NOT EXISTS public.whatsapp_message_credits (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0,
  valid_until DATE,
  used_count INTEGER NOT NULL DEFAULT 0,
  last_topup_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.whatsapp_message_credits IS
  'Ezzy ERP WhatsApp message balance per shop. Each builtin message that reaches sent/delivered/read takes 1. valid_until is inclusive (India date).';

CREATE TABLE IF NOT EXISTS public.whatsapp_credit_topups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  messages INTEGER NOT NULL,
  valid_until DATE NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  lapsed INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_credit_topups_org_created
  ON public.whatsapp_credit_topups (organization_id, created_at DESC);

ALTER TABLE public.whatsapp_message_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_credit_topups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View WhatsApp credits (own shop or platform admin)" ON public.whatsapp_message_credits;
CREATE POLICY "View WhatsApp credits (own shop or platform admin)"
  ON public.whatsapp_message_credits FOR SELECT
  USING (
    public.has_role((select auth.uid()), 'platform_admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.user_id = (select auth.uid())
        AND m.organization_id = whatsapp_message_credits.organization_id
    )
  );

DROP POLICY IF EXISTS "View WhatsApp credit top-ups (own shop or platform admin)" ON public.whatsapp_credit_topups;
CREATE POLICY "View WhatsApp credit top-ups (own shop or platform admin)"
  ON public.whatsapp_credit_topups FOR SELECT
  USING (
    public.has_role((select auth.uid()), 'platform_admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.user_id = (select auth.uid())
        AND m.organization_id = whatsapp_credit_topups.organization_id
    )
  );

-- Writes only through the functions below.
REVOKE INSERT, UPDATE, DELETE ON public.whatsapp_message_credits FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.whatsapp_credit_topups FROM anon, authenticated;
GRANT SELECT ON public.whatsapp_message_credits TO authenticated;
GRANT SELECT ON public.whatsapp_credit_topups TO authenticated;

-- Platform admin adds messages. An expired balance lapses first (leftover is not carried);
-- a live one is added to. Negative p_messages corrects a mistake.
CREATE OR REPLACE FUNCTION public.platform_add_whatsapp_credits(
  p_organization_id UUID,
  p_messages INTEGER,
  p_valid_until DATE DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS public.whatsapp_message_credits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_valid DATE := COALESCE(p_valid_until, ((now() AT TIME ZONE 'Asia/Kolkata')::date + INTERVAL '1 year')::date);
  v_row public.whatsapp_message_credits;
  v_before INTEGER := 0;
  v_lapsed INTEGER := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'platform_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only platform admins can add WhatsApp message balance';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;
  IF p_messages IS NULL OR p_messages = 0 THEN
    RAISE EXCEPTION 'Enter the number of messages';
  END IF;
  IF v_valid < v_today THEN
    RAISE EXCEPTION 'Validity date is in the past';
  END IF;

  INSERT INTO whatsapp_message_credits (organization_id, balance, valid_until)
  VALUES (p_organization_id, 0, v_valid)
  ON CONFLICT (organization_id) DO NOTHING;

  SELECT * INTO v_row FROM whatsapp_message_credits
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  v_before := v_row.balance;
  IF v_row.valid_until IS NOT NULL AND v_row.valid_until < v_today AND v_row.balance > 0 THEN
    v_lapsed := v_row.balance;
    v_before := 0;
  END IF;

  UPDATE whatsapp_message_credits
  SET balance = v_before + p_messages,
      valid_until = v_valid,
      last_topup_at = now(),
      updated_at = now()
  WHERE organization_id = p_organization_id
  RETURNING * INTO v_row;

  INSERT INTO whatsapp_credit_topups (
    organization_id, messages, valid_until, balance_before, balance_after, lapsed, note, created_by
  ) VALUES (
    p_organization_id, p_messages, v_valid, v_before, v_row.balance, v_lapsed,
    NULLIF(trim(COALESCE(p_note, '')), ''), auth.uid()
  );

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_add_whatsapp_credits(UUID, INTEGER, DATE, TEXT) TO authenticated;

-- Take 1 when an Ezzy ERP WhatsApp message first reaches sent/delivered/read.
-- Failed sends cost nothing. Shops without a credits row are untouched.
CREATE OR REPLACE FUNCTION public.deduct_whatsapp_credit_on_send()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.provider IS DISTINCT FROM 'builtin'
     OR NEW.status NOT IN ('sent', 'delivered', 'read') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('sent', 'delivered', 'read') THEN
    RETURN NEW;
  END IF;

  UPDATE whatsapp_message_credits
  SET balance = balance - 1,
      used_count = used_count + 1,
      updated_at = now()
  WHERE organization_id = NEW.organization_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'whatsapp credit deduct failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_whatsapp_credit_on_send() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_deduct_whatsapp_credit ON public.whatsapp_logs;
CREATE TRIGGER trigger_deduct_whatsapp_credit
  AFTER INSERT OR UPDATE OF status ON public.whatsapp_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.deduct_whatsapp_credit_on_send();
