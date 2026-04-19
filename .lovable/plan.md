

## Backup System Audit — Current State

**Cron schedule (working):**
- Job `scheduled-backup` runs daily at **17:30 UTC = 11:00 PM IST** ✅
- Calls edge function `/functions/v1/scheduled-backup` which iterates orgs with `auto_backup_enabled = true`

**Backup execution (PARTIAL FAILURE):**
- Last successful run: **2026-04-13** (6 days ago) ⚠️
- Daily distribution last 30 days: only 4 days had backups (Apr 13, Apr 6, Mar 30, Mar 23) — so it's running **weekly, not daily**
- Apr 13 backed up only 10 of ~150+ enabled orgs; one org stuck `in_progress` (timeout)
- 138 enabled orgs have NO `last_auto_backup_at` ever — they're being skipped or function times out before reaching them

**7-day deletion (NOT IMPLEMENTED):**
- `backup_retention_days` column EXISTS on `settings` (one org set to 7, most at 30)
- BUT: `scheduled-backup` reads `retentionDays` then **never uses it** — no DELETE code anywhere
- Storage bucket `organization-backups` has files dating back to **Mar 9** (41 days old) — nothing being purged
- `backup_logs` table also never purged

## Root Causes

1. **Weekly not daily**: Edge function processes ALL orgs sequentially in one HTTP call. With 150+ orgs × ~3s each = 450s+, exceeding edge function timeout. Most orgs never get reached. Cron still fires daily but function bails.
2. **No retention**: Retention purge logic was never written — value is read from settings but discarded.

## Proposed Fix (3 changes, one migration + edge function update)

### 1. Make daily backup actually run for all orgs
Refactor `scheduled-backup` to **fan out** instead of sequential loop:
- Cron triggers a "dispatcher" that lists all enabled orgs
- For each org, invoke `auto-backup` edge function asynchronously (`supabase.functions.invoke` without await blocking the loop, or use `EdgeRuntime.waitUntil`)
- Each org's backup runs in its own short-lived invocation → no timeout

### 2. Implement retention purge
Add a new function `purgeOldBackups(orgId, retentionDays)` called at end of each org's backup:
- Delete from `storage.organization-backups` where path starts with `{orgId}/` and file is older than `now() - retentionDays`
- Delete from `backup_logs` where `organization_id = orgId AND created_at < now() - retentionDays AND status = 'completed'`
- Honors per-org `backup_retention_days` (so the org set to 7 keeps 7 days, others keep 30)

### 3. Add safety + observability
- Log per-org success/failure to `app_error_logs` on failure
- Add a `purge-old-backups` daily pg_cron job at 04:00 UTC as a backstop (in case a backup run fails to purge)
- Cap purge at 1000 files per run per org for safety

## Files to change

- `supabase/functions/scheduled-backup/index.ts` — convert to dispatcher pattern
- `supabase/functions/auto-backup/index.ts` — add purge call at end (uses `retentionDays` from settings)
- New migration — add backstop daily purge cron + helper SQL function `purge_old_backup_logs(org_id, days)`

## Acceptance

- Tomorrow 11:00 PM IST: ALL ~150 enabled orgs get a fresh backup (verify next morning via `SELECT count(*) FROM backup_logs WHERE created_at > now() - interval '12 hours' AND backup_type = 'automatic'`)
- Org `4bc73037...` (KS_FOOTWEAR, 7-day retention): only last 7 backups exist in storage and `backup_logs`
- Other orgs (30-day retention): only last 30 backups remain
- Files older than retention are gone from `organization-backups` storage bucket

## Note on user's stated setting

The user mentioned "delete after 7 days" — currently only **1 org** has `backup_retention_days = 7`; the rest are 30. After the fix, the per-org setting will actually be honored. If the user wants 7 days globally, they should also update all orgs' settings to 7 (one-line SQL — happy to include in migration if confirmed).

