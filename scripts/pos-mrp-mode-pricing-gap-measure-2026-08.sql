-- Phase 0 measurement: POS MRP-mode pricing vs Rate override badge (2026-08).
-- READ ONLY. No UPDATE/DELETE/INSERT.
-- Run as service_role / SQL Editor. Anon RLS returns zero rows.
--
-- rateAuthority is cart-only and is NOT persisted (sale_items.price_overridden
-- was never applied). Do not look for that column. Proxies below.
--
-- Settings are CURRENT org JSON, not a snapshot at sale time. Restrict line
-- stats to a recent window so current settings are a reasonable stand-in.
--
-- KS Footwear organization_id (from docs/ks-footwear-pos-barcode-mrp-investigation.md):
--   4bc73037-e877-4123-9261-eb6e3876698c
-- After 2026-08-24 13:01 UTC, KS desktop POS auto-bills last_purchase_sale_price
-- (commit a74270890 / PR #370) even when pos_barcode_price_mode = 'mrp'.
-- Query 5's matches_last_purchase_sale vs billed_at_full_mrp is the
-- post-deploy fingerprint of that commit.

-- 1) Orgs whose CURRENT settings would show MRP Price Mode Active
--    AND the Rate override badge gate (enable_mrp = purchase_settings.show_mrp).
SELECT
  o.id AS organization_id,
  o.slug,
  o.name,
  s.sale_settings->>'pos_barcode_price_mode' AS pos_barcode_price_mode,
  s.purchase_settings->>'show_mrp' AS show_mrp,
  s.sale_settings->>'allow_pos_edit_unit_price' AS allow_pos_edit_unit_price,
  s.sale_settings->>'pos_unit_price_override_confirm_pct' AS override_confirm_pct,
  s.sale_settings->>'auto_use_last_purchase_price' AS auto_use_last_purchase_price,
  s.sale_settings->>'ask_price_on_scan' AS ask_price_on_scan
FROM public.organizations o
JOIN public.settings s ON s.organization_id = o.id
WHERE COALESCE(s.sale_settings->>'pos_barcode_price_mode', 'sale_price') = 'mrp'
  AND (s.purchase_settings->>'show_mrp')::boolean IS TRUE
ORDER BY o.slug;

-- 2) KS Footwear current settings (one row)
SELECT
  o.slug,
  s.sale_settings->>'pos_barcode_price_mode' AS pos_barcode_price_mode,
  s.purchase_settings->>'show_mrp' AS show_mrp,
  s.sale_settings->>'allow_pos_edit_unit_price' AS allow_pos_edit_unit_price,
  s.sale_settings->>'pos_unit_price_override_confirm_pct' AS override_confirm_pct,
  s.sale_settings->>'auto_use_last_purchase_price' AS auto_use_last_purchase_price,
  s.sale_settings->>'ask_price_on_scan' AS ask_price_on_scan
FROM public.organizations o
JOIN public.settings s ON s.organization_id = o.id
WHERE o.id = '4bc73037-e877-4123-9261-eb6e3876698c';

-- 3) Screenshot bill reconstruction — does unit_price match master sale,
--    last purchase, or a round 30% off MRP?
SELECT
  s.sale_number,
  s.created_at,
  si.product_name,
  si.barcode,
  si.mrp AS line_mrp,
  si.unit_price AS line_unit,
  si.discount_percent,
  si.line_total,
  ROUND((si.mrp - si.unit_price)::numeric, 2) AS mrp_minus_unit,
  CASE WHEN si.mrp > 0.005
       THEN ROUND(((si.mrp - si.unit_price) / si.mrp * 100)::numeric, 2)
       ELSE NULL END AS pct_off_mrp,
  pv.mrp AS variant_mrp,
  pv.sale_price AS variant_sale_price,
  pv.last_purchase_mrp,
  pv.last_purchase_sale_price,
  p.sale_discount_type,
  p.sale_discount_value,
  ABS(si.unit_price - COALESCE(pv.sale_price, 0)) < 0.02 AS matches_master_sale,
  ABS(si.unit_price - COALESCE(pv.last_purchase_sale_price, 0)) < 0.02 AS matches_last_purchase_sale,
  ABS(si.unit_price - (si.mrp * 0.7)) < 0.05 AS matches_30pct_off_line_mrp
FROM public.sales s
JOIN public.sale_items si ON si.sale_id = s.id AND si.deleted_at IS NULL
LEFT JOIN public.product_variants pv
  ON pv.id = si.variant_id
 AND pv.organization_id = s.organization_id
LEFT JOIN public.products p
  ON p.id = si.product_id
 AND p.organization_id = s.organization_id
WHERE s.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
  AND s.deleted_at IS NULL
  AND s.sale_number = 'POS/26-27/2898';

-- 4) Badge proxy on recent POS lines for MRP-mode orgs (last 14 days).
--    Live badge = enable_mrp AND line.mrp > line.unit_price + 0.001.
--    "unit-authority-shaped" = that gap AND discount_percent ≈ 0
--    (typed unit price OR last-purchase/sale-price add; both look like this).
WITH mrp_orgs AS (
  SELECT o.id
  FROM public.organizations o
  JOIN public.settings s ON s.organization_id = o.id
  WHERE COALESCE(s.sale_settings->>'pos_barcode_price_mode', 'sale_price') = 'mrp'
    AND (s.purchase_settings->>'show_mrp')::boolean IS TRUE
),
pos_lines AS (
  SELECT
    s.organization_id,
    si.id AS sale_item_id,
    si.mrp,
    si.unit_price,
    si.discount_percent,
    si.variant_id,
    (si.mrp > si.unit_price + 0.001) AS badge_would_show,
    (si.mrp > si.unit_price + 0.001 AND COALESCE(si.discount_percent, 0) < 0.05)
      AS unit_authority_shaped,
    ABS(si.unit_price - si.mrp) < 0.02 AS billed_at_mrp
  FROM public.sales s
  JOIN public.sale_items si ON si.sale_id = s.id AND si.deleted_at IS NULL
  WHERE s.organization_id IN (SELECT id FROM mrp_orgs)
    AND s.deleted_at IS NULL
    AND s.sale_number LIKE 'POS/%'
    AND s.created_at >= (now() - interval '14 days')
)
SELECT
  o.slug,
  COUNT(*) AS pos_lines_14d,
  COUNT(*) FILTER (WHERE pl.badge_would_show) AS badge_proxy,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE pl.badge_would_show) / NULLIF(COUNT(*), 0),
    1
  ) AS badge_pct,
  COUNT(*) FILTER (WHERE pl.unit_authority_shaped) AS unit_shaped,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE pl.unit_authority_shaped) / NULLIF(COUNT(*), 0),
    1
  ) AS unit_shaped_pct,
  COUNT(*) FILTER (WHERE pl.billed_at_mrp) AS billed_at_full_mrp,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE pl.billed_at_mrp) / NULLIF(COUNT(*), 0),
    1
  ) AS billed_at_full_mrp_pct
FROM pos_lines pl
JOIN public.organizations o ON o.id = pl.organization_id
GROUP BY o.slug
ORDER BY badge_pct DESC NULLS LAST;

-- 5) Same window: where the unit came from (KS + other MRP-mode orgs).
--    Classify each line against CURRENT variant master / last-purchase.
--    A high last_purchase match with almost no billed_at_mrp supports
--    automatic last-purchase override, not cashier typing.
WITH mrp_orgs AS (
  SELECT o.id
  FROM public.organizations o
  JOIN public.settings s ON s.organization_id = o.id
  WHERE COALESCE(s.sale_settings->>'pos_barcode_price_mode', 'sale_price') = 'mrp'
    AND (s.purchase_settings->>'show_mrp')::boolean IS TRUE
)
SELECT
  o.slug,
  COUNT(*) AS pos_lines_14d,
  COUNT(*) FILTER (
    WHERE ABS(si.unit_price - COALESCE(pv.last_purchase_sale_price, -1)) < 0.02
  ) AS matches_last_purchase_sale,
  COUNT(*) FILTER (
    WHERE ABS(si.unit_price - COALESCE(pv.sale_price, -1)) < 0.02
  ) AS matches_master_sale,
  COUNT(*) FILTER (
    WHERE ABS(si.unit_price - si.mrp) < 0.02
  ) AS matches_line_mrp,
  COUNT(*) FILTER (
    WHERE ABS(si.unit_price - (si.mrp * 0.7)) < 0.05
      AND ABS(si.unit_price - COALESCE(pv.sale_price, -1)) >= 0.02
      AND ABS(si.unit_price - COALESCE(pv.last_purchase_sale_price, -1)) >= 0.02
  ) AS matches_30pct_off_only,
  COUNT(*) FILTER (
    WHERE si.mrp > si.unit_price + 0.001
      AND ABS(si.unit_price - COALESCE(pv.last_purchase_sale_price, -1)) >= 0.02
      AND ABS(si.unit_price - COALESCE(pv.sale_price, -1)) >= 0.02
      AND ABS(si.unit_price - si.mrp) >= 0.02
  ) AS unmatched_below_mrp
FROM public.sales s
JOIN public.sale_items si ON si.sale_id = s.id AND si.deleted_at IS NULL
JOIN public.organizations o ON o.id = s.organization_id
LEFT JOIN public.product_variants pv
  ON pv.id = si.variant_id
 AND pv.organization_id = s.organization_id
WHERE s.organization_id IN (SELECT id FROM mrp_orgs)
  AND s.deleted_at IS NULL
  AND s.sale_number LIKE 'POS/%'
  AND s.created_at >= (now() - interval '14 days')
GROUP BY o.slug
ORDER BY o.slug;

-- 6) Orgs that appear to RELY on bill-at-full-MRP (high billed_at_mrp share).
--    If this is near 100% for any org other than a quiet till, a blanket
--    change to default unitCost = sale_price needs an opt-out for them.
--    (Reuse query 4 billed_at_full_mrp_pct.)
