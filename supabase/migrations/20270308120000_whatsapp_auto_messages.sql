-- Automatic WhatsApp messages (Settings > WhatsApp > Automatic messages): payment-due
-- reminders and birthday / anniversary wishes, sent by the whatsapp-auto edge function
-- from the shop's own linked number. Settings live in settings.sale_settings, sends are
-- logged in whatsapp_logs, so no new table is needed: only the 15-minute dispatcher.
-- The edge function itself only sends between 10:00 and 13:00 India time.

CREATE OR REPLACE FUNCTION public.dispatch_whatsapp_auto()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_token text;
  v_request_id bigint;
  v_url text;
  v_anon text;
BEGIN
  IF auth.role() = 'anon' OR auth.role() = 'authenticated' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.settings
    WHERE sale_settings->>'auto_due_reminder_enabled' = 'true'
       OR sale_settings->>'auto_birthday_wish_enabled' = 'true'
  ) THEN
    RETURN NULL;
  END IF;

  v_url := NULLIF(current_setting('app.supabase_url', true), '');
  v_anon := NULLIF(current_setting('app.supabase_anon_key', true), '');
  IF v_url IS NULL THEN
    v_url := 'https://lkbbrqcsbhqjvsxiorvp.supabase.co';
  END IF;
  IF v_anon IS NULL THEN
    v_anon := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrYmJycWNzYmhxanZzeGlvcnZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NTAyMzIsImV4cCI6MjA3ODAyNjIzMn0.DkxBeR40bFS06Ea9TZcQ9KTuSgik5akoiQFv5mye4ts';
  END IF;

  DELETE FROM public.backup_dispatch_tickets
  WHERE expires_at < now() - interval '1 hour';

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.backup_dispatch_tickets (token, expires_at)
  VALUES (v_token, now() + interval '10 minutes')
  RETURNING id INTO v_id;

  SELECT net.http_post(
    url := v_url || '/functions/v1/whatsapp-auto',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'apikey', v_anon,
      'x-backup-dispatch-ticket', v_id::text || ':' || v_token
    ),
    body := '{"type":"scheduled"}'::jsonb,
    timeout_milliseconds := 120000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dispatch_whatsapp_auto() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_whatsapp_auto() TO postgres;

DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-auto-every-15-min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'whatsapp-auto-every-15-min',
  '*/15 4-8 * * *',
  $$ SELECT public.dispatch_whatsapp_auto(); $$
);
