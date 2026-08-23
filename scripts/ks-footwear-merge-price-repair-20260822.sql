-- =============================================================================
-- KS FOOTWEAR — price repair after 21 Aug duplicate-master merge
-- Tag: [ks_merge_price_repair_20260822]
-- Org: 4bc73037-e877-4123-9261-eb6e3876698c
-- =============================================================================
-- THIS FILE IS READ-ONLY (B0 + C0). It does not UPDATE product_variants.
-- Mutate lives in ks-footwear-merge-price-repair-20260822-mutate.sql
-- and must not be run until B0 CSV is reviewed.
--
-- Latest purchase is the newest bill_date among lines that match:
--   live sku_id, live barcode, deleted-sibling sku_id, or deleted-sibling barcode.
-- Live-sku-only missed PUR/26-27/110 (sticker 0040013293 on the deleted row).
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- B0 — DRY RUN. Run this block alone. Export CSV.
-- ═══════════════════════════════════════════════════════════════════════════

WITH org AS (
  SELECT '4bc73037-e877-4123-9261-eb6e3876698c'::uuid AS id
),
live AS (
  SELECT
    pv.id,
    pv.barcode,
    pv.size,
    pv.color,
    pv.stock_qty,
    pv.mrp,
    pv.sale_price,
    pv.pur_price,
    p.product_name,
    LOWER(TRIM(p.product_name)) AS name_key
  FROM public.product_variants pv
  JOIN public.products p
    ON p.id = pv.product_id
   AND p.organization_id = pv.organization_id
  CROSS JOIN org
  WHERE pv.organization_id = org.id
    AND pv.deleted_at IS NULL
    AND COALESCE(pv.active, true)
    AND p.deleted_at IS NULL
),
dead_sib AS (
  SELECT
    live.id AS live_id,
    dv.id AS dead_id,
    dv.barcode AS dead_barcode
  FROM live
  JOIN public.product_variants dv
    ON dv.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
   AND dv.deleted_at IS NOT NULL
   AND dv.id <> live.id
   AND TRIM(COALESCE(dv.size, '')) = TRIM(COALESCE(live.size, ''))
   AND UPPER(TRIM(COALESCE(dv.color, ''))) = UPPER(TRIM(COALESCE(live.color, '')))
  JOIN public.products dp
    ON dp.id = dv.product_id
   AND LOWER(TRIM(dp.product_name)) = live.name_key
),
linked AS (
  SELECT
    live.id AS variant_id,
    live.product_name,
    live.barcode AS live_barcode,
    live.size,
    live.color,
    live.stock_qty,
    live.mrp AS before_mrp,
    live.sale_price AS before_sale,
    live.pur_price AS before_pur,
    pi.barcode AS purchase_barcode,
    pi.mrp AS purchase_mrp,
    pi.sale_price AS purchase_sale,
    pi.pur_price AS purchase_pur,
    COALESCE(pi.bill_number, pb.software_bill_no) AS bill_number,
    pb.bill_date,
    pi.created_at AS purchase_created_at,
    pi.id AS purchase_item_id
  FROM live
  JOIN public.purchase_items pi
    ON pi.deleted_at IS NULL
   AND (pi.sku_id = live.id OR pi.barcode IS NOT DISTINCT FROM live.barcode)
  JOIN public.purchase_bills pb
    ON pb.id = pi.bill_id
   AND pb.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
   AND pb.deleted_at IS NULL

  UNION ALL

  SELECT
    dead_sib.live_id,
    live.product_name,
    live.barcode,
    live.size,
    live.color,
    live.stock_qty,
    live.mrp,
    live.sale_price,
    live.pur_price,
    pi.barcode,
    pi.mrp,
    pi.sale_price,
    pi.pur_price,
    COALESCE(pi.bill_number, pb.software_bill_no),
    pb.bill_date,
    pi.created_at,
    pi.id
  FROM dead_sib
  JOIN live ON live.id = dead_sib.live_id
  JOIN public.purchase_items pi
    ON pi.deleted_at IS NULL
   AND (
     pi.sku_id = dead_sib.dead_id
     OR pi.barcode IS NOT DISTINCT FROM dead_sib.dead_barcode
   )
  JOIN public.purchase_bills pb
    ON pb.id = pi.bill_id
   AND pb.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
   AND pb.deleted_at IS NULL
),
latest_pi AS (
  SELECT DISTINCT ON (variant_id)
    *
  FROM linked
  ORDER BY variant_id, bill_date DESC NULLS LAST, purchase_created_at DESC
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

-- Hand-check: FL2068 / size 7 / NAVY → after 439.50 / 307.65 / 266.63, PUR/26-27/110


-- ═══════════════════════════════════════════════════════════════════════════
-- C0 — READ ONLY (optional). Do not paste together with B1.
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
