-- Nightly backup cron has failed since at least 2026-08-29 (likely longer) with:
--   "app.supabase_url / app.supabase_anon_key are not configured"
--
-- Root cause: dispatch_nightly_backups() reads these GUCs via
--   current_setting('app.supabase_url', true) / current_setting('app.supabase_anon_key', true)
-- but NO migration ever ran ALTER DATABASE ... SET for them. The values are the same
-- public project URL + anon (publishable) key already shipped in the web client (.env).
-- They were never configured in-repo — not lost in a restore of migration history.
-- (A dashboard-only SET could still have been wiped by a project restore; either way
-- the repo never encoded the required bootstrap.)
--
-- Scope: database-level GUCs so pg_cron sessions inherit them. Leaves the
-- existing stale-flag and retention-purge schedules unchanged.
--
-- Publishable key is intentionally used (edge function verify_jwt = false for
-- scheduled-backup; Authorization bearer is the anon key for gateway routing).

ALTER DATABASE postgres SET app.supabase_url = 'https://lkbbrqcsbhqjvsxiorvp.supabase.co';
ALTER DATABASE postgres SET app.supabase_anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrYmJycWNzYmhxanZzeGlvcnZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NTAyMzIsImV4cCI6MjA3ODAyNjIzMn0.DkxBeR40bFS06Ea9TZcQ9KTuSgik5akoiQFv5mye4ts';

-- Note: existing sessions keep old settings until reconnect. pg_cron opens new
-- sessions, so the next scheduled run picks these up automatically.
