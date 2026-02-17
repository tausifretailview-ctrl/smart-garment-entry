

# Weekly Auto-Backup (Every Monday)

Currently, the scheduled backup edge function exists but has no automated trigger set up in the database. This plan will set up the cron job to run **weekly on Mondays at 11:00 PM IST** and update the UI to reflect this change.

## What will change

1. **Database**: Enable `pg_cron` and `pg_net` extensions, then create a cron job that calls the `scheduled-backup` edge function every Monday at 17:30 UTC (11:00 PM IST).

2. **UI Updates** in `BackupSettings.tsx`:
   - Change all "nightly" / "every night" text to "every Monday at 11:00 PM IST"
   - Update the description to say "Weekly auto-backup" instead of "Nightly auto-backup"

3. **Edge Function** (`scheduled-backup/index.ts`): No changes needed -- it already handles all organizations with `auto_backup_enabled = true`.

## Technical Details

### Step 1: Database Migration
```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Weekly Monday backup at 11:00 PM IST (17:30 UTC)
SELECT cron.schedule(
  'weekly-scheduled-backup',
  '30 17 * * 1',  -- Every Monday at 17:30 UTC
  $$
  SELECT net.http_post(
    url := 'https://lkbbrqcsbhqjvsxiorvp.supabase.co/functions/v1/scheduled-backup',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrYmJycWNzYmhxanZzeGlvcnZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NTAyMzIsImV4cCI6MjA3ODAyNjIzMn0.DkxBeR40bFS06Ea9TZcQ9KTuSgik5akoiQFv5mye4ts"}'::jsonb,
    body := '{"source":"cron","day":"monday"}'::jsonb
  ) AS request_id;
  $$
);
```

### Step 2: UI Text Updates in `BackupSettings.tsx`
- Line 148: "Automatically backs up your data every **Monday** at 11:00 PM IST"
- Line 160: "Enable **Weekly** Auto-Backup (Every Monday, 11:00 PM IST)"
- Line 163: "Backup runs automatically every **Monday**..."
- Line 187: "**Weekly** backup JSON file will be sent..."

