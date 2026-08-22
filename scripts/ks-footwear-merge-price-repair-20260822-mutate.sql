-- =============================================================================
-- KS FOOTWEAR — Phase B1 MUTATE only
-- Tag: [ks_merge_price_repair_20260822]
-- DO NOT RUN until B0 CSV from ks-footwear-merge-price-repair-20260822.sql
-- has been reviewed. Does not touch stock_qty. Does not restore deleted rows.
-- =============================================================================

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
  WITH live AS (
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
    WHERE pv.organization_id = v_org
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
      ON dv.organization_id = v_org
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
      live.stock_qty,
      live.mrp AS before_mrp,
      live.sale_price AS before_sale,
      live.pur_price AS before_pur,
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
     AND pb.organization_id = v_org
     AND pb.deleted_at IS NULL

    UNION ALL

    SELECT
      dead_sib.live_id,
      live.stock_qty,
      live.mrp,
      live.sale_price,
      live.pur_price,
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
     AND pb.organization_id = v_org
     AND pb.deleted_at IS NULL
  ),
  latest_pi AS (
    SELECT DISTINCT ON (variant_id)
      *
    FROM linked
    ORDER BY variant_id, bill_date DESC NULLS LAST, purchase_created_at DESC
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
