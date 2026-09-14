-- Nightly backup stagger + retry verification (SQL Editor, after edge deploy).
-- Platform-wide. Spot-check UI on any org (e.g. ELLA NOOR) only after §2 looks healthy.
--
-- After the next real scheduled run (not a manual trigger), expect:
--   1) Most non-suspended orgs have a completed automatic backup_logs row for the night
--   2) Rate-limit dispatch failures near zero
--   3) Any HTTP 546 failures are org-specific (large export), not systemic

-- §1 Successes per UTC night — compare pre-GUC (before 2026-09-13), post-GUC/pre-stagger, post-stagger
SELECT
  (started_at AT TIME ZONE 'UTC')::date AS backup_day_utc,
  count(*) FILTER (WHERE status = 'completed') AS completed,
  count(*) FILTER (WHERE status = 'failed') AS failed,
  count(*) FILTER (WHERE status = 'in_progress') AS in_progress,
  count(DISTINCT organization_id) FILTER (WHERE status = 'completed') AS orgs_completed,
  count(DISTINCT organization_id) AS orgs_touched
FROM public.backup_logs
WHERE backup_type = 'automatic'
  AND started_at >= now() - interval '14 days'
GROUP BY 1
ORDER BY 1 DESC;

-- §2 Tonight's coverage vs eligible org count (IST calendar day)
WITH eligible AS (
  SELECT o.id
  FROM public.organizations o
  WHERE o.is_suspended IS DISTINCT FROM true
),
tonight AS (
  SELECT DISTINCT organization_id
  FROM public.backup_logs
  WHERE backup_type = 'automatic'
    AND status = 'completed'
    AND started_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')
      AT TIME ZONE 'Asia/Kolkata'
)
SELECT
  (SELECT count(*) FROM eligible) AS eligible_orgs,
  (SELECT count(*) FROM tonight) AS orgs_backed_up_tonight,
  (SELECT count(*) FROM eligible e WHERE NOT EXISTS (
      SELECT 1 FROM tonight t WHERE t.organization_id = e.id
    )) AS orgs_still_missing;

-- §3 Rate-limit / 546 fingerprints in recent failures
SELECT
  organization_id,
  status,
  left(error_message, 200) AS error_preview,
  started_at
FROM public.backup_logs
WHERE backup_type = 'automatic'
  AND status = 'failed'
  AND started_at >= now() - interval '3 days'
  AND (
    error_message ILIKE '%rate%limit%'
    OR error_message ILIKE '%retry after%'
    OR error_message ILIKE '%546%'
    OR error_message ILIKE '%WORKER_RESOURCE_LIMIT%'
  )
ORDER BY started_at DESC
LIMIT 100;

-- §4 Dispatch-layer failures recorded by scheduled-backup
SELECT
  organization_id,
  left(error_message, 200) AS error_preview,
  created_at
FROM public.app_error_logs
WHERE operation = 'scheduled_backup_dispatch'
  AND created_at >= now() - interval '3 days'
ORDER BY created_at DESC
LIMIT 100;

-- §5 Confirm GUC-era dispatch still posts (no missing-url failures)
SELECT created_at, status, error_message, http_request_id
FROM public.backup_dispatch_runs
WHERE created_at >= now() - interval '7 days'
ORDER BY created_at DESC
LIMIT 30;
