-- Spot-check get_orphaned_products: every listed product must have zero active references.
-- Replace :org_id with your organization UUID before running in SQL editor.
--
-- Usage:
--   \set org_id '3fdca631-1e0c-4417-9704-421f5129ff67'
--   \i scripts/verify-orphaned-products-detection.sql

-- 1) Orphan count
SELECT COUNT(*) AS orphan_count
FROM public.get_orphaned_products(:'org_id'::uuid);

-- 2) Any orphan that still has blocking references (should return 0 rows)
WITH orphans AS (
  SELECT product_id
  FROM public.get_orphaned_products(:'org_id'::uuid)
)
SELECT
  o.product_id,
  public._product_has_active_references(:'org_id'::uuid, o.product_id) AS has_refs,
  'FAIL: orphan still referenced' AS issue
FROM orphans o
WHERE public._product_has_active_references(:'org_id'::uuid, o.product_id);

-- 3) Per-table breakdown for orphans (all counts should be 0)
WITH orphans AS (
  SELECT product_id FROM public.get_orphaned_products(:'org_id'::uuid)
)
SELECT
  o.product_id,
  (SELECT COUNT(*) FROM purchase_items pi
    JOIN purchase_bills pb ON pb.id = pi.bill_id
    WHERE pi.product_id = o.product_id AND pi.deleted_at IS NULL AND pb.deleted_at IS NULL
      AND pb.organization_id = :'org_id'::uuid) AS purchase_items,
  (SELECT COUNT(*) FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.order_id
    WHERE poi.product_id = o.product_id AND poi.deleted_at IS NULL AND po.deleted_at IS NULL
      AND po.organization_id = :'org_id'::uuid) AS purchase_order_items,
  (SELECT COUNT(*) FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE si.product_id = o.product_id AND si.deleted_at IS NULL AND s.deleted_at IS NULL
      AND s.organization_id = :'org_id'::uuid) AS sale_items,
  (SELECT COUNT(*) FROM sale_return_items sri
    JOIN sale_returns sr ON sr.id = sri.return_id
    WHERE sri.product_id = o.product_id AND sri.deleted_at IS NULL AND sr.deleted_at IS NULL
      AND sr.organization_id = :'org_id'::uuid) AS sale_return_items,
  (SELECT COUNT(*) FROM purchase_return_items pri
    JOIN purchase_returns pr ON pr.id = pri.return_id
    WHERE pri.product_id = o.product_id AND pri.deleted_at IS NULL AND pr.deleted_at IS NULL
      AND pr.organization_id = :'org_id'::uuid) AS purchase_return_items,
  (SELECT COUNT(*) FROM quotation_items qi
    JOIN quotations q ON q.id = qi.quotation_id
    WHERE qi.product_id = o.product_id AND qi.deleted_at IS NULL AND q.deleted_at IS NULL
      AND q.organization_id = :'org_id'::uuid) AS quotation_items,
  (SELECT COUNT(*) FROM sale_order_items soi
    JOIN sale_orders so ON so.id = soi.order_id
    WHERE soi.product_id = o.product_id AND soi.deleted_at IS NULL AND so.deleted_at IS NULL
      AND so.organization_id = :'org_id'::uuid) AS sale_order_items,
  (SELECT COUNT(*) FROM delivery_challan_items dci
    JOIN delivery_challans dc ON dc.id = dci.challan_id
    WHERE dci.product_id = o.product_id AND dci.deleted_at IS NULL AND dc.deleted_at IS NULL
      AND dc.organization_id = :'org_id'::uuid) AS delivery_challan_items,
  (SELECT COUNT(*) FROM salesman_commissions sc
    LEFT JOIN sales s ON s.id = sc.sale_id
    WHERE sc.product_id IS NOT NULL
      AND sc.product_id = o.product_id::text
      AND sc.organization_id = :'org_id'::uuid
      AND (sc.sale_id IS NULL OR s.deleted_at IS NULL)) AS salesman_commissions,
  (SELECT COUNT(*) FROM product_variants pv
    JOIN stock_movements sm ON sm.variant_id = pv.id
    WHERE pv.product_id = o.product_id AND pv.deleted_at IS NULL
      AND sm.organization_id = :'org_id'::uuid) AS stock_movements,
  (SELECT COUNT(*) FROM product_variants pv
    JOIN batch_stock bs ON bs.variant_id = pv.id
    WHERE pv.product_id = o.product_id AND pv.deleted_at IS NULL
      AND bs.organization_id = :'org_id'::uuid) AS batch_stock,
  (SELECT COUNT(*) FROM product_variants pv
    JOIN customer_product_prices cpp ON cpp.variant_id = pv.id
    WHERE pv.product_id = o.product_id AND pv.deleted_at IS NULL
      AND cpp.organization_id = :'org_id'::uuid) AS customer_product_prices,
  (SELECT COUNT(*) FROM product_images pim
    WHERE pim.product_id = o.product_id AND pim.organization_id = :'org_id'::uuid) AS product_images
FROM orphans o
WHERE
  (SELECT COUNT(*) FROM purchase_items pi JOIN purchase_bills pb ON pb.id = pi.bill_id
    WHERE pi.product_id = o.product_id AND pi.deleted_at IS NULL AND pb.deleted_at IS NULL
      AND pb.organization_id = :'org_id'::uuid) > 0
  OR (SELECT COUNT(*) FROM sale_items si JOIN sales s ON s.id = si.sale_id
    WHERE si.product_id = o.product_id AND si.deleted_at IS NULL AND s.deleted_at IS NULL
      AND s.organization_id = :'org_id'::uuid) > 0
  OR public._product_has_active_references(:'org_id'::uuid, o.product_id);

-- 4) Sample orphan rows
SELECT * FROM public.get_orphaned_products(:'org_id'::uuid) LIMIT 20;
