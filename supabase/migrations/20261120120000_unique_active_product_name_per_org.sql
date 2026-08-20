-- Prevent duplicate active product masters per organization (case/whitespace-insensitive).
--
-- Prerequisite: org-specific consolidation scripts (e.g.
-- scripts/consolidate-ks-footwear-duplicate-masters.sql) must clear existing
-- duplicates first. This migration fails closed if any remain.

DO $$
DECLARE
  v_dup_groups integer;
  v_sample text;
BEGIN
  SELECT COUNT(*) INTO v_dup_groups
  FROM (
    SELECT organization_id, LOWER(TRIM(product_name)) AS name_key
    FROM public.products
    WHERE deleted_at IS NULL
    GROUP BY organization_id, LOWER(TRIM(product_name))
    HAVING COUNT(*) > 1
  ) d;

  IF v_dup_groups > 0 THEN
    SELECT string_agg(
      format('%s / %s (×%s)', organization_id, name_key, cnt),
      '; '
    )
    INTO v_sample
    FROM (
      SELECT
        organization_id::text,
        LOWER(TRIM(product_name)) AS name_key,
        COUNT(*)::text AS cnt
      FROM public.products
      WHERE deleted_at IS NULL
      GROUP BY organization_id, LOWER(TRIM(product_name))
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 5
    ) s;

    RAISE EXCEPTION
      'Cannot create idx_unique_active_product_name_per_org: % duplicate active product-name group(s) remain. Sample: %. Run org consolidation scripts first.',
      v_dup_groups,
      COALESCE(v_sample, '(none)');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_product_name_per_org
ON public.products (organization_id, LOWER(TRIM(product_name)))
WHERE deleted_at IS NULL;

COMMENT ON INDEX public.idx_unique_active_product_name_per_org IS
  'One active product master per org per case-insensitive trimmed name. Soft-deleted rows excluded.';
