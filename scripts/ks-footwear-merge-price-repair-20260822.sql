-- =============================================================================
-- KS FOOTWEAR — price repair after 21 Aug duplicate-master merge
-- Tag: [ks_merge_price_repair_20260822]
-- Org: 4bc73037-e877-4123-9261-eb6e3876698c
-- =============================================================================
-- Phase B only. Does NOT restore deleted variants. Does NOT change stock_qty.
--
-- Latest purchase line is taken by sku_id (post-merge remaps), then by live
-- barcode. Matching live barcode alone would miss PUR/26-27/110 for FL2068
-- (purchase barcode 0040013293, live SKU barcode 40003197).
--
-- Run B0 (dry-run) first. Export the result as CSV for the sign-off.
-- Only then paste B1 (BEGIN…COMMIT) as one run.
-- Expected: ~83 rows, ~₹3,458 on-hand exposure (stock_qty * sale_price delta).
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- B0 — DRY RUN (read-only). Export this result set as CSV.
-- ═══════════════════════════════════════════════════════════════════════════

WITH latest_pi AS (
  SELECT DISTINCT ON (pv.id)
    pv.id AS variant_id,
    p.product_name,
    pv.barcode AS live_barcode,
    pv.size,
    pv.color,
    pv.stock_qty,
    pv.mrp AS before_mrp,
    pv.sale_price AS before_sale,
    pv.pur_price AS before_pur,
    pi.barcode AS purchase_barcode,
    pi.mrp AS purchase_mrp,
    pi.sale_price AS purchase_sale,
    pi.pur_price AS purchase_pur,
    COALESCE(pi.bill_number, pb.software_bill_no) AS bill_number,
    pb.bill_date,
    pi.id AS purchase_item_id
  FROM public.product_variants pv
  JOIN public.products p
    ON p.id = pv.product_id
   AND p.organization_id = pv.organization_id
  JOIN public.purchase_items pi
    ON pi.deleted_at IS NULL
   AND (
     pi.sku_id = pv.id
     OR (pi.sku_id IS NULL AND pi.barcode IS NOT DISTINCT FROM pv.barcode)
   )
  JOIN public.purchase_bills pb
    ON pb.id = pi.bill_id
   AND pb.organization_id = pv.organization_id
   AND pb.deleted_at IS NULL
  WHERE pv.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
    AND pv.deleted_at IS NULL
    AND pv.active IS DISTINCT FROM false
    AND p.deleted_at IS NULL
  ORDER BY pv.id, pb.bill_date DESC NULLS LAST, pi.created_at DESC
)
SELECT
  variant_id,
  product_name,
  live_barcode,
  purchase_barcode,
  size,
  color,
  stock_qty,
  before_mrp,
  purchase_mrp AS after_mrp,
  before_sale,
  purchase_sale AS after_sale,
  before_pur,
  purchase_pur AS after_pur,
  bill_number,
  bill_date,
  ROUND((purchase_sale - before_sale) * COALESCE(stock_qty, 0), 2) AS on_hand_sale_delta,
  '[ks_merge_price_repair_20260822]' AS repair_tag
FROM latest_pi
WHERE purchase_sale > before_sale + 0.005
ORDER BY on_hand_sale_delta DESC, product_name, size, color;

-- Hand-check FL2068 NAVY 7 (expect after MRP 439.50 / sale 307.65 / pur 266.63, PUR/26-27/110)
-- Filter the dry-run for product_name ILIKE '%FL2068%' AND size = '7' AND color ILIKE '%NAVY%'.


-- ═══════════════════════════════════════════════════════════════════════════
-- B1 — MUTATE. One transaction. Run only after B0 is reviewed.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_org uuid := '4bc73037-e877-4123-9261-eb6e3876698c';
  v_tag text := '[ks_merge_price_repair_20260822]';
  v_updated integer := 0;
  v_exposure numeric := 0;
  v_fl2068_mrp numeric;
  v_fl2068_sale numeric;
  v_fl2068_pur numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org) THEN
    RAISE EXCEPTION 'KS Footwear org % not found', v_org;
  END IF;

  CREATE TEMP TABLE _ks_price_repair_20260822 ON COMMIT DROP AS
  WITH latest_pi AS (
    SELECT DISTINCT ON (pv.id)
      pv.id AS variant_id,
      pv.mrp AS before_mrp,
      pv.sale_price AS before_sale,
      pv.pur_price AS before_pur,
      pv.stock_qty,
      pi.mrp AS purchase_mrp,
      pi.sale_price AS purchase_sale,
      pi.pur_price AS purchase_pur,
      COALESCE(pi.bill_number, pb.software_bill_no) AS bill_number,
      pb.bill_date,
      pi.id AS purchase_item_id
    FROM public.product_variants pv
    JOIN public.products p
      ON p.id = pv.product_id
     AND p.organization_id = pv.organization_id
    JOIN public.purchase_items pi
      ON pi.deleted_at IS NULL
     AND (
       pi.sku_id = pv.id
       OR (pi.sku_id IS NULL AND pi.barcode IS NOT DISTINCT FROM pv.barcode)
     )
    JOIN public.purchase_bills pb
      ON pb.id = pi.bill_id
     AND pb.organization_id = pv.organization_id
     AND pb.deleted_at IS NULL
    WHERE pv.organization_id = v_org
      AND pv.deleted_at IS NULL
      AND pv.active IS DISTINCT FROM false
      AND p.deleted_at IS NULL
    ORDER BY pv.id, pb.bill_date DESC NULLS LAST, pi.created_at DESC
  )
  SELECT *
  FROM latest_pi
  WHERE purchase_sale > before_sale + 0.005;

  UPDATE public.product_variants pv
  SET
    mrp = r.purchase_mrp,
    sale_price = r.purchase_sale,
    pur_price = r.purchase_pur,
    updated_at = NOW()
  FROM _ks_price_repair_20260822 r
  WHERE pv.id = r.variant_id
    AND pv.organization_id = v_org
    AND pv.deleted_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT COALESCE(SUM(ROUND((purchase_sale - before_sale) * COALESCE(stock_qty, 0), 2)), 0)
  INTO v_exposure
  FROM _ks_price_repair_20260822;

  INSERT INTO public.audit_logs (
    organization_id, entity_type, entity_id, action, old_values, new_values
  )
  SELECT
    v_org,
    'product_variant',
    r.variant_id,
    'KS_MERGE_PRICE_REPAIR',
    jsonb_build_object(
      'tag', v_tag,
      'mrp', r.before_mrp,
      'sale_price', r.before_sale,
      'pur_price', r.before_pur,
      'stock_qty_untouched', r.stock_qty,
      'bill_number', r.bill_number
    ),
    jsonb_build_object(
      'tag', v_tag,
      'mrp', r.purchase_mrp,
      'sale_price', r.purchase_sale,
      'pur_price', r.purchase_pur,
      'purchase_item_id', r.purchase_item_id
    )
  FROM _ks_price_repair_20260822 r;

  -- Spot-check FL2068 NAVY 7 against PUR/26-27/110
  SELECT pv.mrp, pv.sale_price, pv.pur_price
  INTO v_fl2068_mrp, v_fl2068_sale, v_fl2068_pur
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.organization_id = v_org
    AND pv.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND p.product_name ILIKE '%FL2068%'
    AND TRIM(COALESCE(pv.size, '')) = '7'
    AND UPPER(TRIM(COALESCE(pv.color, ''))) LIKE '%NAVY%'
  ORDER BY pv.stock_qty DESC
  LIMIT 1;

  IF v_fl2068_mrp IS DISTINCT FROM 439.5
     OR v_fl2068_sale IS DISTINCT FROM 307.65
     OR v_fl2068_pur IS DISTINCT FROM 266.63 THEN
    RAISE EXCEPTION
      'FL2068 NAVY 7 assertion failed: mrp=% sale=% pur=% (expected 439.50 / 307.65 / 266.63). Rolling back.',
      v_fl2068_mrp, v_fl2068_sale, v_fl2068_pur;
  END IF;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'No rows updated — aborting empty repair';
  END IF;

  RAISE NOTICE '% updated % variants; on-hand sale-price exposure change ₹%',
    v_tag, v_updated, v_exposure;
END $$;

COMMIT;

-- Post-check: FL2068 NAVY 7
SELECT
  p.product_name,
  pv.barcode,
  pv.size,
  pv.color,
  pv.mrp,
  pv.sale_price,
  pv.pur_price,
  pv.stock_qty
FROM public.product_variants pv
JOIN public.products p ON p.id = pv.product_id
WHERE pv.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
  AND pv.deleted_at IS NULL
  AND p.product_name ILIKE '%FL2068%'
  AND TRIM(COALESCE(pv.size, '')) = '7'
  AND UPPER(TRIM(COALESCE(pv.color, ''))) LIKE '%NAVY%';


-- ═══════════════════════════════════════════════════════════════════════════
-- C0 — READ ONLY: orphaned barcodes whose surviving sibling still has stock
-- (Phase C decision input; do not mutate)
-- ═══════════════════════════════════════════════════════════════════════════

WITH orphan AS (
  SELECT
    dv.barcode,
    dv.size,
    dv.color,
    LOWER(TRIM(p.product_name)) AS name_key
  FROM public.product_variants dv
  JOIN public.products p ON p.id = dv.product_id
  WHERE dv.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
    AND dv.deleted_at IS NOT NULL
    AND dv.deleted_at >= '2026-08-21 03:23:00+00'
    AND dv.deleted_at <  '2026-08-21 03:24:00+00'
    AND NULLIF(TRIM(dv.barcode), '') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.product_variants av
      WHERE av.organization_id = dv.organization_id
        AND av.deleted_at IS NULL
        AND av.barcode = dv.barcode
    )
),
surviving AS (
  SELECT
    LOWER(TRIM(p.product_name)) AS name_key,
    TRIM(COALESCE(pv.size, '')) AS size,
    UPPER(TRIM(COALESCE(pv.color, ''))) AS color,
    pv.stock_qty
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
    AND pv.deleted_at IS NULL
    AND p.deleted_at IS NULL
)
SELECT
  COUNT(DISTINCT o.barcode) AS orphaned_barcodes,
  COUNT(DISTINCT o.barcode) FILTER (
    WHERE COALESCE(s.stock_qty, 0) > 0
  ) AS orphaned_barcodes_with_stock_on_sibling
FROM orphan o
LEFT JOIN surviving s
  ON s.name_key = o.name_key
 AND s.size = TRIM(COALESCE(o.size, ''))
 AND s.color = UPPER(TRIM(COALESCE(o.color, '')));
