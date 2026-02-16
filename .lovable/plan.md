

# Scheduled Auto-Backup at Fixed Time + Email with Backup File

## Overview

Change backup from "on every login" to a **fixed nightly schedule (11:00 PM IST)** that runs automatically for **all organizations** with auto-backup enabled, and **emails the actual backup JSON file** to a configured email address.

---

## How It Will Work

1. A database cron job fires every night at 11:00 PM IST (5:30 PM UTC)
2. It calls a new backend function `scheduled-backup` (no user login required)
3. The function loops through ALL organizations that have `auto_backup_enabled = true`
4. For each org: generates backup, uploads to cloud storage, then emails the backup file as an attachment to the configured email address
5. Remove the "on app load" auto-trigger from the frontend

---

## Email Delivery

To send emails with the backup file attached, we need an email service. **Resend** is the simplest option -- it's free for up to 100 emails/day and takes just one API key.

**What you need to do:** Sign up at [resend.dev](https://resend.dev), get an API key, and provide it when prompted. Alternatively, you can use a free domain like `onboarding@resend.dev` for testing.

---

## Technical Details

### 1. New Edge Function: `scheduled-backup`
- Does NOT require user authentication (called by cron)
- Uses service role to query all organizations where `auto_backup_enabled = true`
- For each org: gathers data, uploads to storage, sends email with JSON attachment
- Logs everything to `backup_logs`

### 2. Database Cron Job (pg_cron + pg_net)
- Schedule: `30 17 * * *` (5:30 PM UTC = 11:00 PM IST)
- Calls `scheduled-backup` edge function via HTTP POST
- No user session needed

### 3. Settings Update
- `backup_email` field already exists -- will use it for sending the actual file
- Default email for all orgs: `tausifpatel728@gmail.com` (configurable per org)

### 4. Frontend Changes
- **Remove** the auto-trigger on app load from `useBackup.tsx`
- Update `BackupSettings.tsx` description: "Backup runs automatically at 11:00 PM every night" instead of "when you open the app"
- Email field description: "Backup file will be sent to this email daily"

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `supabase/functions/scheduled-backup/index.ts` | Create -- loops all orgs, backs up, emails |
| `supabase/config.toml` | Add scheduled-backup function config |
| `src/hooks/useBackup.tsx` | Remove on-login auto-trigger useEffect |
| `src/components/BackupSettings.tsx` | Update descriptions to reflect 11 PM schedule |
| Database (pg_cron) | Set up cron schedule via SQL insert |

---

## Secret Required

- **RESEND_API_KEY** -- needed for sending emails. You will be prompted to enter this.

---

## What Stays the Same
- Manual backup buttons (JSON, Excel, Cloud Now) unchanged
- Backup history table unchanged
- Google Drive advanced section unchanged
- All existing backup data preserved

