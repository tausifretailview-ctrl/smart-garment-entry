## Cloud usage analysis

I checked your actual scheduled jobs, DB sizes, and edge function traffic. Edge functions are **not** the cost driver (only ~24 invocations / day total). The cost is coming from **scheduled jobs + storage + DB size**.

### What I found (biggest offenders)

1. **Duplicate backup jobs running** — you have BOTH:
   - `scheduled-backup` → runs **daily** at 23:00 IST
   - `weekly-scheduled-backup` → runs **Mondays** at 23:00 IST
   
   The earlier "reduce cloud usage" migration was supposed to switch to weekly but never removed the daily one. **Every org with auto-backup ON is being backed up 8 times/week instead of 1.** This is almost certainly your #1 storage cost.

2. **Stock alerts scan running every 4 hours** (`stock-alerts-scan-4h`) — same migration tried to switch this to daily but the old job is still active. That's 6 full-org scans/day across all organizations instead of 1.

3. **`audit_logs` table = 167 MB** (188K rows, going back to Feb 22). 90-day retention is generous; trimming to 45 days will roughly halve it and reduce backup size.

4. **`stock_movements` = 105 MB** — second-largest. Grows forever. Old movements (>180 days) for already-settled stock can be archived/purged.

5. **WhatsApp / frontend polling**: already well-optimized (tier-based, mostly `refetchInterval: false`, realtime subscriptions). No changes needed there.

6. **Backup storage in the `backups` bucket** likely has months of old backups. Needs a retention policy (keep last 7 daily + last 8 weekly, delete older).

### Plan to reduce costs

**Step 1 — Fix scheduled jobs (migration)**
- Unschedule the duplicate daily `scheduled-backup` cron. Keep only `weekly-scheduled-backup`.
- Unschedule `stock-alerts-scan-4h` cleanly. Keep only `stock-alerts-scan-daily`.
- Estimated impact: **~85% fewer scheduled backup runs**, **~83% fewer stock scans**.

**Step 2 — Tighten retention (migration)**
- `audit_logs`: 90d → 45d retention. Frees ~80 MB.
- `app_error_logs`: 90d → 30d retention.
- `stock_movements`: add purge job for movements older than 180 days that are not tied to a non-cancelled sale/purchase from the last 90 days. (Optional — needs your OK because it's domain data.)

**Step 3 — Backup bucket cleanup (edge function or SQL)**
- Add a weekly job that deletes objects in the `backups` storage bucket older than 60 days. This is likely the **single biggest dollar saver** if backups have been running daily for months.

**Step 4 — Verify after 48h**
- Check Cloud usage chart 2 days after the migration to confirm the daily $ drops.

### Files that will change

- New migration: `supabase/migrations/<ts>_cut_cloud_usage_v2.sql`
  - Unschedule duplicate `scheduled-backup` and `stock-alerts-scan-4h`
  - Update `purge_old_audit_logs` cutoff to 45 days
  - Update `purge-old-error-logs` cron command to 30 days
  - Schedule new `purge-old-backups-bucket` cron that calls a small SQL function to list+delete old backup storage objects (or invokes an edge function)

### What I'm NOT touching

- WhatsApp realtime subscriptions (already efficient)
- Frontend polling (already tier-gated)
- Any user-facing feature behavior

---

**Question before I apply**: Are you OK with these retention numbers?
- Audit logs: **45 days** (currently 90)
- Error logs: **30 days** (currently 90)
- Backups in storage: **keep last 60 days** (currently forever)
- Stock movements purge: **skip for now** (safest — only do if you confirm)

Reply "go" with any changes you want and I'll ship the migration.
