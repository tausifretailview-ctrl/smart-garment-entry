
-- Safe deduplication: NULL out barcode on duplicate variants 
-- that have ZERO stock and ZERO sales/purchase history
-- Keeps the oldest variant (earliest created_at) per barcode per org
WITH ranked_dupes AS (
  SELECT
    pv.id,
    pv.barcode,
    pv.organization_id,
    pv.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY pv.organization_id, pv.barcode
      ORDER BY pv.created_at ASC
    ) AS rn,
    COALESCE((SELECT SUM(si.quantity) FROM sale_items si WHERE si.variant_id = pv.id), 0) AS sale_qty,
    COALESCE((SELECT SUM(pi.qty) FROM purchase_items pi WHERE pi.sku_id = pv.id), 0) AS purchase_qty,
    COALESCE((SELECT SUM(bs.quantity) FROM batch_stock bs WHERE bs.variant_id = pv.id), 0) AS stock_qty
  FROM product_variants pv
  WHERE pv.deleted_at IS NULL
    AND pv.barcode IS NOT NULL
    AND pv.barcode != ''
    AND LENGTH(pv.barcode) > 6
    AND EXISTS (
      SELECT 1 FROM product_variants pv2
      WHERE pv2.organization_id = pv.organization_id
        AND pv2.barcode = pv.barcode
        AND pv2.id != pv.id
        AND pv2.deleted_at IS NULL
    )
)
UPDATE product_variants
SET barcode = NULL
WHERE id IN (
  SELECT id FROM ranked_dupes
  WHERE rn > 1
    AND sale_qty = 0
    AND purchase_qty = 0
    AND stock_qty = 0
);

-- RPC function for frontend duplicate barcode check
CREATE OR REPLACE FUNCTION public.check_barcode_duplicate(
  p_barcode TEXT,
  p_org_id UUID,
  p_exclude_variant_id UUID DEFAULT NULL
)
RETURNS TABLE (
  variant_id UUID,
  product_name TEXT,
  size TEXT,
  color TEXT,
  stock_qty INTEGER,
  barcode TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pv.id AS variant_id,
    p.product_name,
    pv.size,
    pv.color,
    COALESCE((SELECT SUM(bs.quantity) FROM batch_stock bs WHERE bs.variant_id = pv.id), 0)::INTEGER AS stock_qty,
    pv.barcode
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  WHERE pv.organization_id = p_org_id
    AND pv.barcode = p_barcode
    AND pv.deleted_at IS NULL
    AND (p_exclude_variant_id IS NULL OR pv.id != p_exclude_variant_id)
  ORDER BY pv.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.check_barcode_duplicate(TEXT, UUID, UUID) TO authenticated;
