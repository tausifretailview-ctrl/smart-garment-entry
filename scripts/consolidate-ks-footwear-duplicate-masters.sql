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
--   Inline the same merge rules as `public.merge_products` (color+size match →
--   transfer stock + remap FKs + soft-delete; else reassign product_id).
--   Do NOT call `merge_products` from the SQL editor — production RPC requires
--   `assert_org_member` / auth.uid(), which is NULL in the dashboard SQL editor
--   (ERROR 42501 Authentication required).
--
--   Phase 1 sets `session_replication_role = replica` for the transaction so
--   purchase/sale stock triggers do NOT fire on FK remaps. Those triggers would
--   (a) double-count stock_qty and (b) insert movement_type values like
--   `purchase_sku_change_in` that are missing from stock_movements_movement_type_check.
--
-- Canonical master = most sold qty, then most stock, then earliest created_at.
--
-- This script:
--   1) PREFLIGHT (read-only) — review before any write
--   2) MUTATE — BEGIN/COMMIT with assertions (run only after preflight looks right)
--
-- Invariants:
--   - Scoped to one organization_id
--   - Soft-delete only (deleted_at / active=false)
--   - product_variants.stock_qty transferred in-script before soft-delete
--   - Stock triggers disabled during remaps (manual stock transfer is authoritative)
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

-- Disable USER triggers for this transaction only. Remapping purchase_items.sku_id
-- otherwise fires handle_purchase_item_update, which:
--   1) adjusts stock_qty again (would double-count after our manual transfer)
--   2) inserts purchase_sku_change_in/out — not in stock_movements_movement_type_check
SET LOCAL session_replication_role = replica;

DO $$
DECLARE
  v_org uuid := '4bc73037-e877-4123-9261-eb6e3876698c';
  v_org_name text;
  v_stock_before jsonb;
  v_stock_after jsonb;
  v_dup_masters_left integer;
  v_orphan_variants integer;
  v_merged integer := 0;
  v_variants_moved integer;
  v_variants_merged integer;
  v_combined_colors text;
  r RECORD;
  v_src_variant RECORD;
  v_target_variant_id uuid;
  v_source_name text;
  v_target_name text;
BEGIN
  -- session_replication_role is transaction-local (SET LOCAL above); confirm
  IF current_setting('session_replication_role', true) IS DISTINCT FROM 'replica' THEN
    RAISE EXCEPTION 'session_replication_role must be replica for this repair (got %)',
      current_setting('session_replication_role', true);
  END IF;

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
        p.product_name,
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
    SELECT id AS source_id, canonical_id AS target_id, name_key, product_name AS source_name
    FROM ranked
    WHERE group_size > 1
      AND rn > 1
    ORDER BY name_key, rn
  LOOP
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

    SELECT product_name INTO v_target_name
    FROM public.products WHERE id = r.target_id;
    v_source_name := r.source_name;
    v_variants_moved := 0;
    v_variants_merged := 0;

    -- Inline merge_products (no assert_org_member — SQL editor has no JWT)
    FOR v_src_variant IN
      SELECT *
      FROM public.product_variants
      WHERE product_id = r.source_id
        AND organization_id = v_org
        AND deleted_at IS NULL
    LOOP
      SELECT id INTO v_target_variant_id
      FROM public.product_variants
      WHERE product_id = r.target_id
        AND organization_id = v_org
        AND COALESCE(color, '') = COALESCE(v_src_variant.color, '')
        AND size = v_src_variant.size
        AND deleted_at IS NULL
      LIMIT 1;

      IF v_target_variant_id IS NOT NULL THEN
        UPDATE public.product_variants
        SET stock_qty = COALESCE(stock_qty, 0) + COALESCE(v_src_variant.stock_qty, 0),
            opening_qty = COALESCE(opening_qty, 0) + COALESCE(v_src_variant.opening_qty, 0),
            updated_at = NOW()
        WHERE id = v_target_variant_id
          AND organization_id = v_org;

        UPDATE public.sale_items SET variant_id = v_target_variant_id
        WHERE variant_id = v_src_variant.id;
        UPDATE public.purchase_items SET sku_id = v_target_variant_id
        WHERE sku_id = v_src_variant.id;
        UPDATE public.sale_return_items SET variant_id = v_target_variant_id
        WHERE variant_id = v_src_variant.id;
        UPDATE public.purchase_return_items SET sku_id = v_target_variant_id
        WHERE sku_id = v_src_variant.id;
        UPDATE public.quotation_items SET variant_id = v_target_variant_id
        WHERE variant_id = v_src_variant.id;
        UPDATE public.sale_order_items SET variant_id = v_target_variant_id
        WHERE variant_id = v_src_variant.id;
        UPDATE public.purchase_order_items SET variant_id = v_target_variant_id
        WHERE variant_id = v_src_variant.id;
        UPDATE public.delivery_challan_items SET variant_id = v_target_variant_id
        WHERE variant_id = v_src_variant.id;
        UPDATE public.batch_stock
        SET variant_id = v_target_variant_id
        WHERE organization_id = v_org AND variant_id = v_src_variant.id;
        UPDATE public.stock_movements
        SET variant_id = v_target_variant_id
        WHERE organization_id = v_org AND variant_id = v_src_variant.id;
        UPDATE public.customer_product_prices
        SET variant_id = v_target_variant_id
        WHERE organization_id = v_org AND variant_id = v_src_variant.id;
        UPDATE public.stock_alerts
        SET variant_id = v_target_variant_id
        WHERE organization_id = v_org AND variant_id = v_src_variant.id;
        UPDATE public.stock_settlement_scans
        SET variant_id = v_target_variant_id
        WHERE organization_id = v_org AND variant_id = v_src_variant.id;
        UPDATE public.stock_settlement_zero_items
        SET variant_id = v_target_variant_id
        WHERE organization_id = v_org AND variant_id = v_src_variant.id;

        UPDATE public.product_variants
        SET deleted_at = NOW(),
            active = false,
            stock_qty = 0,
            updated_at = NOW()
        WHERE id = v_src_variant.id
          AND organization_id = v_org;

        v_variants_merged := v_variants_merged + 1;
      ELSE
        UPDATE public.product_variants
        SET product_id = r.target_id,
            updated_at = NOW()
        WHERE id = v_src_variant.id
          AND organization_id = v_org
          AND deleted_at IS NULL;
        v_variants_moved := v_variants_moved + 1;
      END IF;
    END LOOP;

    UPDATE public.sale_items SET product_id = r.target_id WHERE product_id = r.source_id;
    UPDATE public.purchase_items SET product_id = r.target_id WHERE product_id = r.source_id;
    UPDATE public.sale_return_items SET product_id = r.target_id WHERE product_id = r.source_id;
    UPDATE public.purchase_return_items SET product_id = r.target_id WHERE product_id = r.source_id;
    UPDATE public.quotation_items SET product_id = r.target_id WHERE product_id = r.source_id;
    UPDATE public.sale_order_items SET product_id = r.target_id WHERE product_id = r.source_id;
    UPDATE public.purchase_order_items SET product_id = r.target_id WHERE product_id = r.source_id;
    UPDATE public.delivery_challan_items SET product_id = r.target_id WHERE product_id = r.source_id;

    UPDATE public.product_images
    SET product_id = r.target_id
    WHERE product_id = r.source_id;

    SELECT STRING_AGG(DISTINCT v.color, ', ' ORDER BY v.color)
    INTO v_combined_colors
    FROM public.product_variants v
    WHERE v.product_id = r.target_id
      AND v.organization_id = v_org
      AND v.deleted_at IS NULL
      AND v.color IS NOT NULL;

    UPDATE public.products
    SET color = v_combined_colors,
        updated_at = NOW()
    WHERE id = r.target_id
      AND organization_id = v_org;

    UPDATE public.products
    SET deleted_at = NOW(),
        updated_at = NOW()
    WHERE id = r.source_id
      AND organization_id = v_org
      AND deleted_at IS NULL;

    INSERT INTO public.audit_logs (
      organization_id, entity_type, entity_id, action, old_values, new_values
    )
    VALUES (
      v_org,
      'product',
      r.target_id,
      'PRODUCT_MERGED',
      jsonb_build_object(
        'source_product_id', r.source_id,
        'source_product_name', v_source_name,
        'via', 'consolidate-ks-footwear-duplicate-masters.sql'
      ),
      jsonb_build_object(
        'variants_moved', v_variants_moved,
        'variants_merged', v_variants_merged,
        'target_product_name', v_target_name
      )
    );

    v_merged := v_merged + 1;
    RAISE NOTICE 'Merged % → % (%) moved=% merged_skus=%',
      r.source_id, r.target_id, r.name_key, v_variants_moved, v_variants_merged;
  END LOOP;

  RAISE NOTICE 'Pair merges completed: %', v_merged;

  -- Zero leftover qty on soft-deleted variants (display hygiene)
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

-- Restored automatically at COMMIT; set explicitly for clarity if more statements follow
SET LOCAL session_replication_role = origin;

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
