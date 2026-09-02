-- Phase 1 Block 0 — paste this ENTIRE file into the SQL editor and Run.
-- This is SQL, not the Markdown doc. Do NOT paste docs/phase-1-rollback-storm-2026-09.md
-- (that file starts with ## and fails: ERROR 42601 syntax error at or near "##").
-- Read-only. Do NOT pg_stat_statements_reset().
-- Export the one result row.

SELECT
  current_database() AS datname,
  d.xact_commit,
  d.xact_rollback,
  ROUND(
    100.0 * d.xact_rollback / NULLIF(d.xact_commit + d.xact_rollback, 0),
    2
  ) AS rollback_pct,
  d.conflicts,
  d.deadlocks,
  d.temp_files,
  d.stats_reset AS db_stats_reset,
  (SELECT stats_reset FROM pg_stat_statements_info) AS pgss_stats_reset,
  pg_postmaster_start_time() AS postmaster_start,
  now() AS sampled_at,
  ROUND(
    d.xact_rollback
      / GREATEST(EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time())), 1),
    3
  ) AS rollbacks_per_sec_since_boot,
  ROUND(
    d.xact_rollback
      / GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(d.stats_reset, pg_postmaster_start_time()))), 1),
    3
  ) AS rollbacks_per_sec_since_db_stats_reset
FROM pg_stat_database d
WHERE d.datname = current_database();
