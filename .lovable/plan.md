

# Easy Auto-Backup: Zero-Config Cloud Storage + Optional Email

## The Problem

The current Google Drive backup requires users to navigate Google Cloud Console, create OAuth credentials, and use OAuth Playground to get a refresh token -- this is far too technical for most users.

## The Solution

Replace the complex Google Drive setup with a **zero-configuration cloud backup** system that works out of the box, plus an optional email delivery.

---

## How It Works

**1. Cloud Storage Backups (No Setup Required)**
- Backups are saved to a private storage bucket built into Lovable Cloud
- Admin simply toggles "Enable Daily Auto-Backup" ON
- Every time the app is opened, it checks if today's backup exists -- if not, it runs automatically in the background
- Last 30 days of backups are retained (older ones auto-deleted)
- Users can download any backup from the history table

**2. Email Backup (Optional -- Just Enter Email)**
- Admin enters one or more email addresses in settings
- A small backup summary + download link is emailed daily
- Uses a backend function to send the email -- no API keys needed from the user

**3. Keep Google Drive as Advanced Option**
- The existing Google Drive section stays but is collapsed under "Advanced" for power users who want it

---

## Technical Details

### Database Changes
- Add columns to `settings` table:
  - `auto_backup_enabled` (boolean, default false)
  - `backup_email` (text, nullable -- comma-separated emails)
  - `last_auto_backup_at` (timestamptz, nullable)
  - `backup_retention_days` (integer, default 30)

### Storage Bucket
- Create a private `organization-backups` storage bucket
- Files stored as: `{org_id}/{YYYY-MM-DD}.json`
- RLS: users can only access their own organization's backups

### Edge Function: `auto-backup`
- Takes `organizationId`, generates the JSON backup (same data as current)
- Uploads to the storage bucket instead of Google Drive
- Logs to `backup_logs` table as before
- Optionally sends email notification with a time-limited download link

### Frontend: Simplified Backup Settings
- **Toggle**: "Enable Daily Auto-Backup" (one click)
- **Email field**: "Send backup notification to" (optional)
- **Retention**: Dropdown for 7 / 14 / 30 / 60 days
- **Google Drive**: Collapsed under "Advanced Setup" accordion
- **History table**: Same as current, but with download buttons for cloud backups

### Auto-Trigger Logic (in `useBackup` hook)
- On app load, check `last_auto_backup_at` in settings
- If auto-backup is enabled AND no backup exists for today, trigger `auto-backup` edge function in background
- Non-blocking -- user sees a subtle toast "Daily backup running..." and can continue working

### Backup Cleanup
- A database function `cleanup_old_backups()` deletes storage files and log entries older than the retention period
- Called by the auto-backup edge function after each successful backup

---

## UI Layout (Settings > Backup Tab)

```text
+-----------------------------------------------+
| Cloud Auto-Backup                              |
| Automatically backs up your data daily.        |
| No setup required.                             |
|                                                |
| [Toggle] Enable Daily Auto-Backup              |
|                                                |
| Email Notification (optional)                  |
| [ admin@company.com                    ]       |
|                                                |
| Retention: [ 30 days v ]                       |
|                                                |
| Last backup: Today at 9:15 AM                  |
+-----------------------------------------------+

+-----------------------------------------------+
| Manual Backup                                  |
| [Download JSON]  [Download Excel]  [Cloud Now] |
+-----------------------------------------------+

> Advanced: Google Drive Setup (collapsed)        
+-----------------------------------------------+
| Backup History (table -- same as current)      |
+-----------------------------------------------+
```

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `supabase/functions/auto-backup/index.ts` | Create -- backup to storage bucket |
| `src/components/BackupSettings.tsx` | Rewrite -- simplified UI with toggle, email, retention |
| `src/hooks/useBackup.tsx` | Update -- add auto-trigger on app load, cloud download |
| Database migration | Add settings columns, create storage bucket + policies |

## What Stays the Same
- All existing backup data and logs are preserved
- Local JSON and Excel download still work exactly as before
- Google Drive option remains available under "Advanced"
- No existing data is deleted or modified

