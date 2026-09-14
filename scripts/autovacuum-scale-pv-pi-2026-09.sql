-- =============================================================================
-- Autovacuum scale_factor 0.05 — product_variants + purchase_items
-- Same fix as sales (17 Aug 2026). No manual VACUUM.
-- =============================================================================
-- Run in Supabase SQL Editor (service role / postgres).
-- Order: §1 before → §2 ALTER → §3 settings confirm → §4 after (hours later).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- §1 BEFORE — dead tuples + last_autovacuum (paste/export this CSV first)
-- -----------------------------------------------------------------------------
SELECT
  c.relname AS table_name,
  s.n_live_tup AS live_tuples,
  s.n_dead_tup AS dead_tuples,
  CASE
    WHEN s.n_live_tup > 0
      THEN ROUND((100.0 * s.n_dead_tup / s.n_live_tup)::numeric, 1)
    ELSE 0
  END AS dead_pct,
  s.last_autovacuum,
  s.last_autoanalyze,
  (
    SELECT option_value
    FROM pg_options_to_table(c.reloptions)
    WHERE option_name = 'autovacuum_vacuum_scale_factor'
  ) AS vacuum_scale_factor
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_stat_user_tables s ON s.relid = c.oid
WHERE n.nspname = 'public'
  AND c.relname IN ('product_variants', 'purchase_items', 'sales')
ORDER BY c.relname;
-- Expect (pre-fix, approximate from 13 Sep check):
--   product_variants  ~15.6% dead, scale_factor NULL (cluster default 0.2)
--   purchase_items    ~14.7% dead, scale_factor NULL
--   sales             scale_factor 0.05 (control)

-- -----------------------------------------------------------------------------
-- §2 APPLY — storage parameter only (safe in business hours; no exclusive lock)
-- -----------------------------------------------------------------------------
ALTER TABLE public.product_variants
  SET (autovacuum_vacuum_scale_factor = 0.05);

ALTER TABLE public.purchase_items
  SET (autovacuum_vacuum_scale_factor = 0.05);

-- -----------------------------------------------------------------------------
-- §3 CONFIRM settings stuck (run immediately after §2)
-- -----------------------------------------------------------------------------
SELECT
  c.relname AS table_name,
  (
    SELECT option_value
    FROM pg_options_to_table(c.reloptions)
    WHERE option_name = 'autovacuum_vacuum_scale_factor'
  ) AS vacuum_scale_factor
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('product_variants', 'purchase_items', 'sales')
ORDER BY 1;
-- Expect: all three show 0.05

-- -----------------------------------------------------------------------------
-- §4 AFTER — re-run hours later (do NOT VACUUM manually; wait for autovacuum)
-- Same query as §1. Expect:
--   last_autovacuum newer than apply time
--   dead_pct dropped meaningfully (sales pattern: near-zero same day)
-- If neither table has fired within 1–2 hours, investigate — do not VACUUM yet.
-- -----------------------------------------------------------------------------

-- Optional lock / activity peek while autovacuum may be running:
-- SELECT pid, usename, state, wait_event_type, wait_event, query_start, left(query, 120) AS query
-- FROM pg_stat_activity
-- WHERE datname = current_database()
--   AND (query ILIKE '%product_variants%' OR query ILIKE '%purchase_items%' OR query ILIKE '%autovacuum%')
-- ORDER BY query_start;
