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

-- -----------------------------------------------------------------------------
-- RUN ONCE (POS save error: item_notes / schema cache) — 20260211120000
-- Supabase Dashboard → SQL Editor → paste → Run. Safe to re-run (IF NOT EXISTS).
-- -----------------------------------------------------------------------------
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS item_notes TEXT DEFAULT NULL;

COMMENT ON COLUMN public.sale_items.item_notes IS 'Optional line-level description (design number, brand, barcode etc). Appears on invoice print.';

-- If PostgREST still says "schema cache", wait ~1 min or: Dashboard → Settings → API → Reload schema (if available).

-- =============================================================================
-- Accounting historical backfill (ALL organizations) — preview + verify
-- NOTE:
-- - Run app-level backfill loop from UI/code (do NOT rebuild journal logic in SQL).
-- - These SQL blocks are for safety checks before/after backfill.
-- - Track both 'failed' and 'error' in journal_status.
-- =============================================================================

-- PREVIEW 1: Sales journal_status by organization
SELECT
  o.name AS org_name,
  s.organization_id,
  count(*) FILTER (WHERE s.journal_status = 'pending') AS pending_rows,
  count(*) FILTER (WHERE s.journal_status = 'posted') AS posted_rows,
  count(*) FILTER (WHERE s.journal_status IN ('failed', 'error')) AS failed_or_error_rows,
  count(*) AS total_rows
FROM public.sales s
JOIN public.organizations o ON o.id = s.organization_id
WHERE s.deleted_at IS NULL
  AND s.is_cancelled = false
GROUP BY o.name, s.organization_id
ORDER BY pending_rows DESC, failed_or_error_rows DESC, org_name;

-- PREVIEW 2: Purchase bills journal_status by organization
SELECT
  o.name AS org_name,
  p.organization_id,
  count(*) FILTER (WHERE p.journal_status = 'pending') AS pending_rows,
  count(*) FILTER (WHERE p.journal_status = 'posted') AS posted_rows,
  count(*) FILTER (WHERE p.journal_status IN ('failed', 'error')) AS failed_or_error_rows,
  count(*) AS total_rows
FROM public.purchase_bills p
JOIN public.organizations o ON o.id = p.organization_id
WHERE p.deleted_at IS NULL
  AND p.is_cancelled = false
GROUP BY o.name, p.organization_id
ORDER BY pending_rows DESC, failed_or_error_rows DESC, org_name;

-- PREVIEW 3: Sale returns journal_status by organization
SELECT
  o.name AS org_name,
  sr.organization_id,
  count(*) FILTER (WHERE sr.journal_status = 'pending') AS pending_rows,
  count(*) FILTER (WHERE sr.journal_status = 'posted') AS posted_rows,
  count(*) FILTER (WHERE sr.journal_status IN ('failed', 'error')) AS failed_or_error_rows,
  count(*) AS total_rows
FROM public.sale_returns sr
JOIN public.organizations o ON o.id = sr.organization_id
WHERE sr.deleted_at IS NULL
GROUP BY o.name, sr.organization_id
ORDER BY pending_rows DESC, failed_or_error_rows DESC, org_name;

-- PREVIEW 4: Purchase returns journal_status by organization
SELECT
  o.name AS org_name,
  pr.organization_id,
  count(*) FILTER (WHERE pr.journal_status = 'pending') AS pending_rows,
  count(*) FILTER (WHERE pr.journal_status = 'posted') AS posted_rows,
  count(*) FILTER (WHERE pr.journal_status IN ('failed', 'error')) AS failed_or_error_rows,
  count(*) AS total_rows
FROM public.purchase_returns pr
JOIN public.organizations o ON o.id = pr.organization_id
WHERE pr.deleted_at IS NULL
GROUP BY o.name, pr.organization_id
ORDER BY pending_rows DESC, failed_or_error_rows DESC, org_name;

-- VERIFY 1 (after backfill): one summary table for all four document types
WITH status_union AS (
  SELECT 'sales'::text AS doc_type, s.organization_id, s.journal_status
  FROM public.sales s
  WHERE s.deleted_at IS NULL AND s.is_cancelled = false
  UNION ALL
  SELECT 'purchase_bills'::text, p.organization_id, p.journal_status
  FROM public.purchase_bills p
  WHERE p.deleted_at IS NULL AND p.is_cancelled = false
  UNION ALL
  SELECT 'sale_returns'::text, sr.organization_id, sr.journal_status
  FROM public.sale_returns sr
  WHERE sr.deleted_at IS NULL
  UNION ALL
  SELECT 'purchase_returns'::text, pr.organization_id, pr.journal_status
  FROM public.purchase_returns pr
  WHERE pr.deleted_at IS NULL
)
SELECT
  o.name AS org_name,
  su.organization_id,
  su.doc_type,
  count(*) FILTER (WHERE su.journal_status = 'pending') AS pending_rows,
  count(*) FILTER (WHERE su.journal_status = 'posted') AS posted_rows,
  count(*) FILTER (WHERE su.journal_status IN ('failed', 'error')) AS failed_or_error_rows,
  count(*) AS total_rows
FROM status_union su
JOIN public.organizations o ON o.id = su.organization_id
GROUP BY o.name, su.organization_id, su.doc_type
ORDER BY o.name, su.doc_type;

-- VERIFY 2 (after backfill): only org/docs still needing attention
WITH status_union AS (
  SELECT 'sales'::text AS doc_type, s.organization_id, s.journal_status
  FROM public.sales s
  WHERE s.deleted_at IS NULL AND s.is_cancelled = false
  UNION ALL
  SELECT 'purchase_bills'::text, p.organization_id, p.journal_status
  FROM public.purchase_bills p
  WHERE p.deleted_at IS NULL AND p.is_cancelled = false
  UNION ALL
  SELECT 'sale_returns'::text, sr.organization_id, sr.journal_status
  FROM public.sale_returns sr
  WHERE sr.deleted_at IS NULL
  UNION ALL
  SELECT 'purchase_returns'::text, pr.organization_id, pr.journal_status
  FROM public.purchase_returns pr
  WHERE pr.deleted_at IS NULL
)
SELECT
  o.name AS org_name,
  su.organization_id,
  su.doc_type,
  count(*) FILTER (WHERE su.journal_status = 'pending') AS pending_rows,
  count(*) FILTER (WHERE su.journal_status IN ('failed', 'error')) AS failed_or_error_rows
FROM status_union su
JOIN public.organizations o ON o.id = su.organization_id
GROUP BY o.name, su.organization_id, su.doc_type
HAVING
  count(*) FILTER (WHERE su.journal_status = 'pending') > 0
  OR count(*) FILTER (WHERE su.journal_status IN ('failed', 'error')) > 0
ORDER BY pending_rows DESC, failed_or_error_rows DESC, org_name, doc_type;

-- TROUBLESHOOT: top failed/error rows with error message (all orgs, all doc types)
WITH failures AS (
  SELECT
    'sales'::text AS doc_type,
    s.organization_id,
    s.id AS doc_id,
    s.sale_number AS doc_number,
    s.sale_date::date AS doc_date,
    s.journal_status,
    s.journal_error
  FROM public.sales s
  WHERE s.deleted_at IS NULL
    AND s.is_cancelled = false
    AND s.journal_status IN ('failed', 'error')

  UNION ALL

  SELECT
    'purchase_bills'::text,
    p.organization_id,
    p.id,
    p.software_bill_no AS doc_number,
    p.bill_date::date AS doc_date,
    p.journal_status,
    p.journal_error
  FROM public.purchase_bills p
  WHERE p.deleted_at IS NULL
    AND p.is_cancelled = false
    AND p.journal_status IN ('failed', 'error')

  UNION ALL

  SELECT
    'sale_returns'::text,
    sr.organization_id,
    sr.id,
    sr.return_number AS doc_number,
    sr.return_date::date AS doc_date,
    sr.journal_status,
    sr.journal_error
  FROM public.sale_returns sr
  WHERE sr.deleted_at IS NULL
    AND sr.journal_status IN ('failed', 'error')

  UNION ALL

  SELECT
    'purchase_returns'::text,
    pr.organization_id,
    pr.id,
    pr.return_number AS doc_number,
    pr.return_date::date AS doc_date,
    pr.journal_status,
    pr.journal_error
  FROM public.purchase_returns pr
  WHERE pr.deleted_at IS NULL
    AND pr.journal_status IN ('failed', 'error')
)
SELECT
  o.name AS org_name,
  f.organization_id,
  f.doc_type,
  f.doc_id,
  f.doc_number,
  f.doc_date,
  f.journal_status,
  COALESCE(NULLIF(trim(f.journal_error), ''), '(no error text)') AS journal_error
FROM failures f
JOIN public.organizations o ON o.id = f.organization_id
ORDER BY f.doc_date DESC NULLS LAST, org_name, f.doc_type
LIMIT 50;

-- TROUBLESHOOT (single org): set either org ID or org name below
-- Tip: keep one NULL and set the other.
WITH params AS (
  SELECT
    NULL::uuid AS target_org_id,         -- e.g. '00000000-0000-0000-0000-000000000000'::uuid
    NULL::text AS target_org_name        -- e.g. 'My Organization Name'
),
failures AS (
  SELECT
    'sales'::text AS doc_type,
    s.organization_id,
    s.id AS doc_id,
    s.sale_number AS doc_number,
    s.sale_date::date AS doc_date,
    s.journal_status,
    s.journal_error
  FROM public.sales s
  WHERE s.deleted_at IS NULL
    AND s.is_cancelled = false
    AND s.journal_status IN ('failed', 'error')

  UNION ALL

  SELECT
    'purchase_bills'::text,
    p.organization_id,
    p.id,
    p.software_bill_no AS doc_number,
    p.bill_date::date AS doc_date,
    p.journal_status,
    p.journal_error
  FROM public.purchase_bills p
  WHERE p.deleted_at IS NULL
    AND p.is_cancelled = false
    AND p.journal_status IN ('failed', 'error')

  UNION ALL

  SELECT
    'sale_returns'::text,
    sr.organization_id,
    sr.id,
    sr.return_number AS doc_number,
    sr.return_date::date AS doc_date,
    sr.journal_status,
    sr.journal_error
  FROM public.sale_returns sr
  WHERE sr.deleted_at IS NULL
    AND sr.journal_status IN ('failed', 'error')

  UNION ALL

  SELECT
    'purchase_returns'::text,
    pr.organization_id,
    pr.id,
    pr.return_number AS doc_number,
    pr.return_date::date AS doc_date,
    pr.journal_status,
    pr.journal_error
  FROM public.purchase_returns pr
  WHERE pr.deleted_at IS NULL
    AND pr.journal_status IN ('failed', 'error')
)
SELECT
  o.name AS org_name,
  f.organization_id,
  f.doc_type,
  f.doc_id,
  f.doc_number,
  f.doc_date,
  f.journal_status,
  COALESCE(NULLIF(trim(f.journal_error), ''), '(no error text)') AS journal_error
FROM failures f
JOIN public.organizations o ON o.id = f.organization_id
CROSS JOIN params p
WHERE
  (p.target_org_id IS NULL OR f.organization_id = p.target_org_id)
  AND (p.target_org_name IS NULL OR o.name = p.target_org_name)
ORDER BY f.doc_date DESC NULLS LAST, f.doc_type
LIMIT 100;
