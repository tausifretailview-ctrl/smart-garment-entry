-- Stock reconciliation parity: stored stock_qty vs transaction-history recompute.
-- Run in Supabase SQL editor — ONE block at a time (do not Run entire file).
--
-- Canonical formula (matches reconcile_variant_stock_qty / 20260414111705):
--   opening_qty + purchases - sales - purchase_returns + sale_returns - pending_dc
--
-- Orgs (examples from other verify scripts):
--   ELLA NOOR (invoice) 3fdca631-1e0c-4417-9704-421f5129ff67
--   KS FOOTWEAR (POS)    4bc73037-e877-4123-9261-eb6e3876698c
--   Velvet (POS)         dafc3d0c-874e-4784-bac3-5eab5f3c85b5


-- =============================================================================
-- 0) Smoke — count variants with any drift for an org (set org id below)
-- =============================================================================
\set org_id 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'

WITH variant_calc AS (
  SELECT
    pv.id AS variant_id,
    pv.stock_qty AS stored_stock_qty,
    COALESCE(pv.opening_qty, 0) AS opening_qty,
    COALESCE((
      SELECT SUM(pi.qty)
      FROM purchase_items pi
      JOIN purchase_bills pb ON pb.id = pi.bill_id
      WHERE pi.sku_id = pv.id
        AND pi.deleted_at IS NULL
        AND pb.deleted_at IS NULL
    ), 0) AS purchases,
    COALESCE((
      SELECT SUM(si.quantity)
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE si.variant_id = pv.id
        AND si.deleted_at IS NULL
        AND s.deleted_at IS NULL
    ), 0) AS sales,
    COALESCE((
      SELECT SUM(pri.qty)
      FROM purchase_return_items pri
      JOIN purchase_returns pr ON pr.id = pri.return_id
      WHERE pri.sku_id = pv.id
        AND pri.deleted_at IS NULL
        AND pr.deleted_at IS NULL
    ), 0) AS pur_returns,
    COALESCE((
      SELECT SUM(sri.quantity)
      FROM sale_return_items sri
      JOIN sale_returns sr ON sr.id = sri.return_id
      WHERE sri.variant_id = pv.id
        AND sri.deleted_at IS NULL
        AND sr.deleted_at IS NULL
    ), 0) AS sale_returns,
    COALESCE((
      SELECT SUM(dci.quantity)
      FROM delivery_challan_items dci
      JOIN delivery_challans dc ON dc.id = dci.challan_id
      WHERE dci.variant_id = pv.id
        AND dci.deleted_at IS NULL
        AND dc.deleted_at IS NULL
        AND dc.converted_to_invoice_id IS NULL
        AND dc.status != 'cancelled'
    ), 0) AS pending_dc
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  WHERE pv.organization_id = :'org_id'::uuid
    AND pv.deleted_at IS NULL
    AND COALESCE(p.product_type, 'goods') NOT IN ('service', 'combo')
),
ranked AS (
  SELECT
    variant_id,
    stored_stock_qty,
    opening_qty,
    purchases,
    sales,
    pur_returns,
    sale_returns,
    pending_dc,
    (opening_qty + purchases - sales - pur_returns + sale_returns - pending_dc) AS recomputed_stock_qty,
    stored_stock_qty
      - (opening_qty + purchases - sales - pur_returns + sale_returns - pending_dc) AS drift
  FROM variant_calc
)
SELECT
  COUNT(*) FILTER (WHERE drift != 0) AS variants_with_drift,
  COUNT(*) AS variants_checked,
  COALESCE(MAX(ABS(drift)), 0) AS max_abs_drift
FROM ranked;


-- =============================================================================
-- 1) Three-variant sample: worst drift + two random active (paste org uuid)
-- =============================================================================
-- Replace the uuid literal if not using psql variables:
WITH variant_calc AS (
  SELECT
    pv.id AS variant_id,
    pv.barcode,
    p.product_name,
    pv.size,
    pv.stock_qty AS stored_stock_qty,
    COALESCE(pv.opening_qty, 0) AS opening_qty,
    COALESCE((
      SELECT SUM(pi.qty)
      FROM purchase_items pi
      JOIN purchase_bills pb ON pb.id = pi.bill_id
      WHERE pi.sku_id = pv.id
        AND pi.deleted_at IS NULL
        AND pb.deleted_at IS NULL
    ), 0) AS purchases,
    COALESCE((
      SELECT SUM(si.quantity)
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE si.variant_id = pv.id
        AND si.deleted_at IS NULL
        AND s.deleted_at IS NULL
    ), 0) AS sales,
    COALESCE((
      SELECT SUM(pri.qty)
      FROM purchase_return_items pri
      JOIN purchase_returns pr ON pr.id = pri.return_id
      WHERE pri.sku_id = pv.id
        AND pri.deleted_at IS NULL
        AND pr.deleted_at IS NULL
    ), 0) AS pur_returns,
    COALESCE((
      SELECT SUM(sri.quantity)
      FROM sale_return_items sri
      JOIN sale_returns sr ON sr.id = sri.return_id
      WHERE sri.variant_id = pv.id
        AND sri.deleted_at IS NULL
        AND sr.deleted_at IS NULL
    ), 0) AS sale_returns,
    COALESCE((
      SELECT SUM(dci.quantity)
      FROM delivery_challan_items dci
      JOIN delivery_challans dc ON dc.id = dci.challan_id
      WHERE dci.variant_id = pv.id
        AND dci.deleted_at IS NULL
        AND dc.deleted_at IS NULL
        AND dc.converted_to_invoice_id IS NULL
        AND dc.status != 'cancelled'
    ), 0) AS pending_dc
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  WHERE pv.organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid
    AND pv.deleted_at IS NULL
    AND COALESCE(p.product_type, 'goods') NOT IN ('service', 'combo')
),
ranked AS (
  SELECT
    variant_calc.*,
    (opening_qty + purchases - sales - pur_returns + sale_returns - pending_dc) AS recomputed_stock_qty,
    stored_stock_qty
      - (opening_qty + purchases - sales - pur_returns + sale_returns - pending_dc) AS drift
  FROM variant_calc
)
(
  SELECT 'worst_drift' AS sample, r.*
  FROM ranked r
  WHERE r.drift != 0
  ORDER BY ABS(r.drift) DESC
  LIMIT 1
)
UNION ALL
(
  SELECT 'random_active' AS sample, r.*
  FROM ranked r
  WHERE r.purchases > 0 AND r.sales > 0
  ORDER BY random()
  LIMIT 2
);


-- =============================================================================
-- 2) Top 20 drifts for investigation
-- =============================================================================
WITH variant_calc AS (
  SELECT
    pv.id AS variant_id,
    pv.barcode,
    p.product_name,
    pv.size,
    pv.stock_qty AS stored_stock_qty,
    COALESCE(pv.opening_qty, 0) AS opening_qty,
    COALESCE((
      SELECT SUM(pi.qty)
      FROM purchase_items pi
      JOIN purchase_bills pb ON pb.id = pi.bill_id
      WHERE pi.sku_id = pv.id
        AND pi.deleted_at IS NULL
        AND pb.deleted_at IS NULL
    ), 0) AS purchases,
    COALESCE((
      SELECT SUM(si.quantity)
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE si.variant_id = pv.id
        AND si.deleted_at IS NULL
        AND s.deleted_at IS NULL
    ), 0) AS sales,
    COALESCE((
      SELECT SUM(pri.qty)
      FROM purchase_return_items pri
      JOIN purchase_returns pr ON pr.id = pri.return_id
      WHERE pri.sku_id = pv.id
        AND pri.deleted_at IS NULL
        AND pr.deleted_at IS NULL
    ), 0) AS pur_returns,
    COALESCE((
      SELECT SUM(sri.quantity)
      FROM sale_return_items sri
      JOIN sale_returns sr ON sr.id = sri.return_id
      WHERE sri.variant_id = pv.id
        AND sri.deleted_at IS NULL
        AND sr.deleted_at IS NULL
    ), 0) AS sale_returns,
    COALESCE((
      SELECT SUM(dci.quantity)
      FROM delivery_challan_items dci
      JOIN delivery_challans dc ON dc.id = dci.challan_id
      WHERE dci.variant_id = pv.id
        AND dci.deleted_at IS NULL
        AND dc.deleted_at IS NULL
        AND dc.converted_to_invoice_id IS NULL
        AND dc.status != 'cancelled'
    ), 0) AS pending_dc
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  WHERE pv.organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid
    AND pv.deleted_at IS NULL
    AND COALESCE(p.product_type, 'goods') NOT IN ('service', 'combo')
)
SELECT
  variant_id,
  barcode,
  product_name,
  size,
  stored_stock_qty,
  (opening_qty + purchases - sales - pur_returns + sale_returns - pending_dc) AS recomputed_stock_qty,
  stored_stock_qty
    - (opening_qty + purchases - sales - pur_returns + sale_returns - pending_dc) AS drift,
  opening_qty,
  purchases,
  sales,
  pur_returns,
  sale_returns,
  pending_dc
FROM variant_calc
WHERE stored_stock_qty
  != (opening_qty + purchases - sales - pur_returns + sale_returns - pending_dc)
ORDER BY ABS(
  stored_stock_qty
    - (opening_qty + purchases - sales - pur_returns + sale_returns - pending_dc)
) DESC
LIMIT 20;


-- =============================================================================
-- 3) DIAG — deployed detect_stock_discrepancies may be broken (20260422081353)
--     If this errors on variant_id / opening_stock, ignore RPC; use blocks 0–2.
-- =============================================================================
SELECT *
FROM public.detect_stock_discrepancies('dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid)
LIMIT 5;
