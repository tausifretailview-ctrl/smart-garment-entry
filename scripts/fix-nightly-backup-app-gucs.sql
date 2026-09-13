-- Paste into Supabase SQL Editor as postgres (project lkbbrqcsbhqjvsxiorvp)
-- Fixes nightly dispatch_nightly_backups GUC miss. Does NOT touch stale/retention jobs.

ALTER DATABASE postgres SET app.supabase_url = 'https://lkbbrqcsbhqjvsxiorvp.supabase.co';
ALTER DATABASE postgres SET app.supabase_anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrYmJycWNzYmhxanZzeGlvcnZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NTAyMzIsImV4cCI6MjA3ODAyNjIzMn0.DkxBeR40bFS06Ea9TZcQ9KTuSgik5akoiQFv5mye4ts';

-- Current SQL-editor session does not inherit ALTER DATABASE until reconnect:
SET app.supabase_url = 'https://lkbbrqcsbhqjvsxiorvp.supabase.co';
SET app.supabase_anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrYmJycWNzYmhxanZzeGlvcnZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NTAyMzIsImV4cCI6MjA3ODAyNjIzMn0.DkxBeR40bFS06Ea9TZcQ9KTuSgik5akoiQFv5mye4ts';

SELECT
  current_setting('app.supabase_url', true) AS url,
  left(current_setting('app.supabase_anon_key', true), 16) AS anon_prefix;

-- Manual dispatch (same function pg_cron calls):
SELECT public.dispatch_nightly_backups() AS request_id;

-- Expect a 'posted' row (not the GUC failure):
SELECT id, created_at, status, error_message, http_request_id, ticket_id
FROM public.backup_dispatch_runs
ORDER BY created_at DESC
LIMIT 5;
