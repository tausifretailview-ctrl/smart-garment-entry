-- =============================================================================
-- KS FOOTWEAR — consolidate duplicate product masters (SAFE REPAIR)
-- =============================================================================
-- Organization: 4bc73037-e877-4123-9261-eb6e3876698c (KS Footwear)
--
-- Problem:
--   Multiple active `products` rows share the same LOWER(TRIM(product_name)).
--   Variants / stock_qty are split across those masters. Sale-order pick lists
--   bind to one variant_id while purchases landed on a sibling master → Available=0.
--
-- Approach:
--   Prefer the existing SECURITY DEFINER RPC `public.merge_products(target, source)`
--   (moves / merges variants, remaps sale/purchase/order FKs, soft-deletes source).
--   Canonical master = most sold qty, then most stock, then earliest created_at.
--
-- This script:
--   1) PREFLIGHT (read-only) — review before any write
--   2) MUTATE — BEGIN/COMMIT with assertions (run only after preflight looks right)
--
-- Invariants:
--   - Scoped to one organization_id
--   - Soft-delete only via merge_products
--   - product_variants.stock_qty transferred by merge_products before soft-delete
--
-- DO NOT run the MUTATE block until PREFLIGHT results are reviewed.
-- Run this BEFORE applying
--   supabase/migrations/20261120120000_unique_active_product_name_per_org.sql
-- (that migration refuses to create the unique index while duplicates remain).
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 0 — READ ONLY PREFLIGHT
-- ═══════════════════════════════════════════════════════════════════════════

-- P0.1 Confirm org
SELECT id, name, slug
FROM public.organizations
WHERE id = '4bc73037-e877-4123-9261-eb6e3876698c';

-- P0.2 Duplicate active product-name groups + canonical pick
WITH scored AS (
  SELECT
    p.id,
    p.product_name,
    p.created_at,
    LOWER(TRIM(p.product_name)) AS name_key,
    COALESCE((
      SELECT SUM(si.quantity)
      FROM public.sale_items si
      JOIN public.sales s ON s.id = si.sale_id
      WHERE si.product_id = p.id
        AND si.deleted_at IS NULL
        AND s.deleted_at IS NULL
        AND s.organization_id = p.organization_id
    ), 0) AS sold_qty,
    COALESCE((
      SELECT SUM(pv.stock_qty)
      FROM public.product_variants pv
      WHERE pv.product_id = p.id
        AND pv.organization_id = p.organization_id
        AND pv.deleted_at IS NULL
    ), 0) AS stock_qty
  FROM public.products p
  WHERE p.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
    AND p.deleted_at IS NULL
),
ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY name_key
      ORDER BY sold_qty DESC, stock_qty DESC, created_at ASC, id ASC
    ) AS rn,
    COUNT(*) OVER (PARTITION BY name_key) AS group_size
  FROM scored
)
SELECT
  name_key,
  group_size,
  id AS product_id,
  product_name,
  sold_qty,
  stock_qty,
  created_at,
  (rn = 1) AS is_canonical
FROM ranked
WHERE group_size > 1
ORDER BY name_key, rn;

-- P0.3 Stock totals that MUST be preserved (sum active stock by name_key)
SELECT
  LOWER(TRIM(p.product_name)) AS name_key,
  COUNT(DISTINCT p.id) AS master_count,
  COALESCE(SUM(pv.stock_qty), 0) AS total_stock
FROM public.products p
JOIN public.product_variants pv
  ON pv.product_id = p.id
 AND pv.organization_id = p.organization_id
 AND pv.deleted_at IS NULL
WHERE p.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
  AND p.deleted_at IS NULL
GROUP BY LOWER(TRIM(p.product_name))
HAVING COUNT(DISTINCT p.id) > 1
ORDER BY name_key;

-- P0.4 Sale-order lines whose bound variant has 0 stock while a sibling master
--      (same LOWER name) still holds stock — the pick-list blank-dash case
SELECT
  so.order_number,
  soi.product_name,
  soi.size,
  soi.pending_qty,
  pv.stock_qty AS bound_variant_stock,
  (
    SELECT COALESCE(SUM(pv2.stock_qty), 0)
    FROM public.products p2
    JOIN public.product_variants pv2
      ON pv2.product_id = p2.id
     AND pv2.deleted_at IS NULL
     AND pv2.organization_id = p2.organization_id
    WHERE p2.organization_id = so.organization_id
      AND p2.deleted_at IS NULL
      AND LOWER(TRIM(p2.product_name)) = LOWER(TRIM(soi.product_name))
      AND LOWER(TRIM(COALESCE(pv2.size, ''))) = LOWER(TRIM(COALESCE(soi.size, '')))
  ) AS family_size_stock
FROM public.sale_order_items soi
JOIN public.sale_orders so ON so.id = soi.order_id
LEFT JOIN public.product_variants pv ON pv.id = soi.variant_id
WHERE so.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
  AND so.deleted_at IS NULL
  AND soi.deleted_at IS NULL
  AND soi.pending_qty > 0
  AND COALESCE(pv.stock_qty, 0) = 0
ORDER BY so.order_number, soi.product_name, soi.size
LIMIT 100;


-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 1 — MUTATE (single transaction; review Phase 0 first)
-- Paste from BEGIN through COMMIT into the SQL editor as one run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_org uuid := '4bc73037-e877-4123-9261-eb6e3876698c';
  v_org_name text;
  v_stock_before jsonb;
  v_stock_after jsonb;
  v_dup_masters_left integer;
  v_orphan_variants integer;
  v_merged integer := 0;
  r RECORD;
  v_result json;
BEGIN
  SELECT name INTO v_org_name FROM public.organizations WHERE id = v_org;
  IF v_org_name IS NULL THEN
    RAISE EXCEPTION 'KS Footwear org % not found — aborting', v_org;
  END IF;

  SELECT COALESCE(jsonb_object_agg(name_key, total_stock), '{}'::jsonb)
  INTO v_stock_before
  FROM (
    SELECT
      LOWER(TRIM(p.product_name)) AS name_key,
      COALESCE(SUM(pv.stock_qty), 0)::bigint AS total_stock
    FROM public.products p
    JOIN public.product_variants pv
      ON pv.product_id = p.id
     AND pv.organization_id = p.organization_id
     AND pv.deleted_at IS NULL
    WHERE p.organization_id = v_org
      AND p.deleted_at IS NULL
    GROUP BY LOWER(TRIM(p.product_name))
    HAVING COUNT(DISTINCT p.id) > 1
  ) s;

  RAISE NOTICE 'Consolidating duplicate masters for % (%)', v_org_name, v_org;
  RAISE NOTICE 'Stock snapshot (duplicate name keys): %', v_stock_before;

  FOR r IN
    WITH scored AS (
      SELECT
        p.id,
        LOWER(TRIM(p.product_name)) AS name_key,
        COALESCE((
          SELECT SUM(si.quantity)
          FROM public.sale_items si
          JOIN public.sales s ON s.id = si.sale_id
          WHERE si.product_id = p.id AND si.deleted_at IS NULL
            AND s.deleted_at IS NULL AND s.organization_id = p.organization_id
        ), 0) AS sold_qty,
        COALESCE((
          SELECT SUM(pv.stock_qty) FROM public.product_variants pv
          WHERE pv.product_id = p.id AND pv.organization_id = p.organization_id
            AND pv.deleted_at IS NULL
        ), 0) AS stock_qty,
        p.created_at
      FROM public.products p
      WHERE p.organization_id = v_org
        AND p.deleted_at IS NULL
    ),
    ranked AS (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY name_key
          ORDER BY sold_qty DESC, stock_qty DESC, created_at ASC, id ASC
        ) AS rn,
        COUNT(*) OVER (PARTITION BY name_key) AS group_size,
        FIRST_VALUE(id) OVER (
          PARTITION BY name_key
          ORDER BY sold_qty DESC, stock_qty DESC, created_at ASC, id ASC
        ) AS canonical_id
      FROM scored
    )
    SELECT id AS source_id, canonical_id AS target_id, name_key
    FROM ranked
    WHERE group_size > 1
      AND rn > 1
    ORDER BY name_key, rn
  LOOP
    -- Guard: both still active and same org (merge_products also checks)
    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = r.target_id AND organization_id = v_org AND deleted_at IS NULL
    ) OR NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = r.source_id AND organization_id = v_org AND deleted_at IS NULL
    ) THEN
      RAISE NOTICE 'Skip stale pair target=% source=%', r.target_id, r.source_id;
      CONTINUE;
    END IF;

    v_result := public.merge_products(r.target_id, r.source_id);
    v_merged := v_merged + 1;
    RAISE NOTICE 'Merged % → % (%) result=%', r.source_id, r.target_id, r.name_key, v_result;

    -- Supplemental FKs not covered by merge_products (purchase orders / settlements)
    UPDATE public.purchase_order_items poi
    SET product_id = r.target_id
    FROM public.purchase_orders po
    WHERE poi.order_id = po.id
      AND po.organization_id = v_org
      AND poi.product_id = r.source_id;

    -- Remap any leftover variant_ids that still point at soft-deleted source variants
    -- onto the surviving color+size row under the target (belt-and-braces).
    UPDATE public.purchase_order_items poi
    SET variant_id = cv.id
    FROM public.purchase_orders po
    JOIN public.product_variants sv
      ON sv.id = poi.variant_id
     AND sv.organization_id = v_org
     AND sv.deleted_at IS NOT NULL
     AND sv.product_id = r.source_id
    JOIN public.product_variants cv
      ON cv.product_id = r.target_id
     AND cv.organization_id = v_org
     AND cv.deleted_at IS NULL
     AND COALESCE(cv.color, '') = COALESCE(sv.color, '')
     AND cv.size = sv.size
    WHERE poi.order_id = po.id
      AND po.organization_id = v_org
      AND poi.variant_id = sv.id;
  END LOOP;

  RAISE NOTICE 'merge_products calls completed: %', v_merged;

  -- Zero stock on soft-deleted variants that still hold qty (display hygiene)
  UPDATE public.product_variants pv
  SET stock_qty = 0,
      active = false,
      updated_at = NOW()
  WHERE pv.organization_id = v_org
    AND pv.deleted_at IS NOT NULL
    AND COALESCE(pv.stock_qty, 0) <> 0
    AND pv.product_id IN (
      SELECT id FROM public.products
      WHERE organization_id = v_org
        AND deleted_at IS NOT NULL
    );

  -- ── Assertions ──────────────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_dup_masters_left
  FROM (
    SELECT LOWER(TRIM(product_name)) AS name_key
    FROM public.products
    WHERE organization_id = v_org
      AND deleted_at IS NULL
    GROUP BY LOWER(TRIM(product_name))
    HAVING COUNT(*) > 1
  ) x;

  IF v_dup_masters_left > 0 THEN
    RAISE EXCEPTION 'Assertion failed: % duplicate active product-name groups remain',
      v_dup_masters_left;
  END IF;

  SELECT COUNT(*) INTO v_orphan_variants
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.organization_id = v_org
    AND pv.deleted_at IS NULL
    AND p.deleted_at IS NOT NULL;

  IF v_orphan_variants > 0 THEN
    RAISE EXCEPTION 'Assertion failed: % active variants still point at soft-deleted products',
      v_orphan_variants;
  END IF;

  SELECT COALESCE(jsonb_object_agg(name_key, total_stock), '{}'::jsonb)
  INTO v_stock_after
  FROM (
    SELECT
      LOWER(TRIM(p.product_name)) AS name_key,
      COALESCE(SUM(pv.stock_qty), 0)::bigint AS total_stock
    FROM public.products p
    JOIN public.product_variants pv
      ON pv.product_id = p.id
     AND pv.organization_id = p.organization_id
     AND pv.deleted_at IS NULL
    WHERE p.organization_id = v_org
      AND p.deleted_at IS NULL
      AND LOWER(TRIM(p.product_name)) IN (
        SELECT jsonb_object_keys(v_stock_before)
      )
    GROUP BY LOWER(TRIM(p.product_name))
  ) s;

  IF v_stock_after IS DISTINCT FROM v_stock_before THEN
    RAISE EXCEPTION
      'Assertion failed: stock totals by name_key changed. before=% after=%',
      v_stock_before, v_stock_after;
  END IF;

  RAISE NOTICE 'KS Footwear consolidation OK (% merges). Stock preserved.', v_merged;
END $$;

COMMIT;

-- Post-check: expect 0 rows
SELECT
  LOWER(TRIM(product_name)) AS name_key,
  COUNT(*) AS active_masters
FROM public.products
WHERE organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
  AND deleted_at IS NULL
GROUP BY LOWER(TRIM(product_name))
HAVING COUNT(*) > 1;
