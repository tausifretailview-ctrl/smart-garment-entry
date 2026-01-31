-- Create table to store aggregated WhatsApp message stats per organization per day
CREATE TABLE public.whatsapp_message_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stat_date DATE NOT NULL,
  total_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  pending_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, stat_date)
);

-- Create index for faster queries
CREATE INDEX idx_whatsapp_message_stats_org_date ON public.whatsapp_message_stats(organization_id, stat_date DESC);
CREATE INDEX idx_whatsapp_message_stats_date ON public.whatsapp_message_stats(stat_date DESC);

-- Enable RLS
ALTER TABLE public.whatsapp_message_stats ENABLE ROW LEVEL SECURITY;

-- Platform admins can view all stats
CREATE POLICY "Platform admins can view all WhatsApp stats"
  ON public.whatsapp_message_stats
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'platform_admin'
    )
  );

-- Organization members can view their own stats
CREATE POLICY "Org members can view own WhatsApp stats"
  ON public.whatsapp_message_stats
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members 
      WHERE user_id = auth.uid() 
      AND organization_id = whatsapp_message_stats.organization_id
    )
  );

-- Function to aggregate WhatsApp logs into stats before cleanup
CREATE OR REPLACE FUNCTION public.aggregate_and_cleanup_whatsapp_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cutoff_date TIMESTAMPTZ;
BEGIN
  -- Calculate cutoff date (2 days ago)
  v_cutoff_date := NOW() - INTERVAL '2 days';
  
  -- Aggregate logs older than 2 days into stats table
  INSERT INTO whatsapp_message_stats (
    organization_id,
    stat_date,
    total_count,
    sent_count,
    delivered_count,
    read_count,
    failed_count,
    pending_count
  )
  SELECT 
    organization_id,
    DATE(created_at) as stat_date,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
    COUNT(*) FILTER (WHERE status = 'delivered') as delivered_count,
    COUNT(*) FILTER (WHERE status = 'read') as read_count,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_count
  FROM whatsapp_logs
  WHERE created_at < v_cutoff_date
  GROUP BY organization_id, DATE(created_at)
  ON CONFLICT (organization_id, stat_date) 
  DO UPDATE SET
    total_count = whatsapp_message_stats.total_count + EXCLUDED.total_count,
    sent_count = whatsapp_message_stats.sent_count + EXCLUDED.sent_count,
    delivered_count = whatsapp_message_stats.delivered_count + EXCLUDED.delivered_count,
    read_count = whatsapp_message_stats.read_count + EXCLUDED.read_count,
    failed_count = whatsapp_message_stats.failed_count + EXCLUDED.failed_count,
    pending_count = whatsapp_message_stats.pending_count + EXCLUDED.pending_count,
    updated_at = NOW();
  
  -- Delete logs older than 2 days after aggregation
  DELETE FROM whatsapp_logs WHERE created_at < v_cutoff_date;
END;
$$;

-- Function to get organization message stats (combines recent logs + historical stats)
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
  RETURN QUERY
  WITH historical_stats AS (
    -- Get aggregated stats from stats table
    SELECT 
      s.organization_id,
      SUM(s.total_count) as total_count,
      SUM(s.sent_count) as sent_count,
      SUM(s.delivered_count) as delivered_count,
      SUM(s.read_count) as read_count,
      SUM(s.failed_count) as failed_count,
      SUM(s.pending_count) as pending_count
    FROM whatsapp_message_stats s
    WHERE (p_start_date IS NULL OR s.stat_date >= p_start_date)
      AND (p_end_date IS NULL OR s.stat_date <= p_end_date)
    GROUP BY s.organization_id
  ),
  recent_logs AS (
    -- Get counts from recent logs (last 2 days or within date range)
    SELECT 
      l.organization_id,
      COUNT(*) as total_count,
      COUNT(*) FILTER (WHERE l.status = 'sent') as sent_count,
      COUNT(*) FILTER (WHERE l.status = 'delivered') as delivered_count,
      COUNT(*) FILTER (WHERE l.status = 'read') as read_count,
      COUNT(*) FILTER (WHERE l.status = 'failed') as failed_count,
      COUNT(*) FILTER (WHERE l.status = 'pending') as pending_count
    FROM whatsapp_logs l
    WHERE (p_start_date IS NULL OR DATE(l.created_at) >= p_start_date)
      AND (p_end_date IS NULL OR DATE(l.created_at) <= p_end_date)
    GROUP BY l.organization_id
  ),
  combined AS (
    SELECT 
      COALESCE(h.organization_id, r.organization_id) as org_id,
      COALESCE(h.total_count, 0) + COALESCE(r.total_count, 0) as total_count,
      COALESCE(h.sent_count, 0) + COALESCE(r.sent_count, 0) as sent_count,
      COALESCE(h.delivered_count, 0) + COALESCE(r.delivered_count, 0) as delivered_count,
      COALESCE(h.read_count, 0) + COALESCE(r.read_count, 0) as read_count,
      COALESCE(h.failed_count, 0) + COALESCE(r.failed_count, 0) as failed_count,
      COALESCE(h.pending_count, 0) + COALESCE(r.pending_count, 0) as pending_count
    FROM historical_stats h
    FULL OUTER JOIN recent_logs r ON h.organization_id = r.organization_id
  )
  SELECT 
    c.org_id as organization_id,
    o.name as organization_name,
    c.total_count,
    c.sent_count,
    c.delivered_count,
    c.read_count,
    c.failed_count,
    c.pending_count
  FROM combined c
  JOIN organizations o ON o.id = c.org_id
  ORDER BY c.total_count DESC;
END;
$$;

-- Create a trigger function to update stats when log status changes
CREATE OR REPLACE FUNCTION public.update_whatsapp_stats_on_log_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Insert or update stats for today when a new log is created
  INSERT INTO whatsapp_message_stats (
    organization_id,
    stat_date,
    total_count,
    sent_count,
    delivered_count,
    read_count,
    failed_count,
    pending_count
  )
  VALUES (
    NEW.organization_id,
    DATE(NEW.created_at),
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

-- Create trigger on whatsapp_logs
CREATE TRIGGER trigger_update_whatsapp_stats
  AFTER INSERT ON public.whatsapp_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_whatsapp_stats_on_log_insert();