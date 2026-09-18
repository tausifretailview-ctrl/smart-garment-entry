-- =============================================================================
-- STEP 2 — unique active product name (SQL-editor safe, no DO $$)
-- Run AFTER the KS mutate COMMIT (post-check already returned 0 rows).
--
-- The SQL editor rejects DO $$ here (42601 unterminated dollar-quoted string).
-- CREATE UNIQUE INDEX itself fail-closes if any org still has duplicate names.
--
-- Paste this entire file as ONE run. Do not click Format SQL first.
-- Safe to re-run (IF NOT EXISTS).
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_product_name_per_org
ON public.products (organization_id, LOWER(TRIM(product_name)))
WHERE deleted_at IS NULL;

COMMENT ON INDEX public.idx_unique_active_product_name_per_org IS
  'One active product master per org per case-insensitive trimmed name. Soft-deleted rows excluded.';
