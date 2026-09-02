-- Phase 1 Block 1 — paste this ENTIRE file and Run. Then Block 0 if not done.
-- App-visible errors, 30 days. SQL editor bypasses RLS.
-- Export CSV.

SELECT
  COALESCE(operation, '(null)') AS operation,
  COALESCE(error_code, '(null)') AS error_code,
  COUNT(*) AS n,
  MIN(created_at) AS first_seen,
  MAX(created_at) AS last_seen,
  LEFT(MIN(error_message), 160) AS sample_message
FROM public.app_error_logs
WHERE created_at >= now() - interval '30 days'
GROUP BY 1, 2
ORDER BY n DESC
LIMIT 40;
