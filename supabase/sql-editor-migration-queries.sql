-- =============================================================================
-- Supabase SQL Editor — migration helpers for THIS project
-- Full migration bodies live in: supabase/migrations/*.sql (435+ files).
-- You CANNOT safely paste “all migrations” in one run — apply each file in order,
-- or use CLI: supabase link && supabase db push
-- =============================================================================

-- 1) See which migrations Supabase has already recorded (after CLI `db push`)
--    Columns may include version, name (depends on project); use * if needed.
SELECT *
FROM supabase_migrations.schema_migrations
ORDER BY version;

-- 2) Count applied migrations
SELECT count(*) AS applied_migration_files
FROM supabase_migrations.schema_migrations;

-- If (1) errors with “relation does not exist”, migrations were never applied
-- via Supabase CLI on this database — either run CLI push or paste SQL from
-- individual files under supabase/migrations/ in filename (timestamp) order.

-- -----------------------------------------------------------------------------
-- Manual apply workflow (SQL Editor only)
-- -----------------------------------------------------------------------------
-- 1. In your repo, sort supabase/migrations/ by filename ascending.
-- 2. Open each .sql file; copy its FULL contents into SQL Editor → Run.
-- 3. Skip files that fail because objects already exist — fix conflict or use
--    idempotent patterns (IF NOT EXISTS) only if the migration already uses them.
-- 4. Prefer `supabase db push` so schema_migrations stays in sync.
-- -----------------------------------------------------------------------------

-- Optional: after you successfully ran ONE migration file by hand, you can record
-- it so CLI won’t re-apply (USE ONLY IF YOU KNOW THE VERSION STRING MATCHES THE FILE).
-- WARNING: wrong inserts break future pushes — prefer CLI.
--
-- INSERT INTO supabase_migrations.schema_migrations (version, name)
-- VALUES ('20260506000000', 'add_dc_to_purchase_returns')
-- ON CONFLICT DO NOTHING;
