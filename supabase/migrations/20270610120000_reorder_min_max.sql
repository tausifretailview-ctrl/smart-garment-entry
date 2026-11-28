-- Reorder by min / max stock (supermarket phase 2, Nov 2026).
--
-- products.reorder_level (minimum, Industrial mode 20270325120000) gets a maximum:
-- products.max_stock. get_reorder_suggestions lists what to buy, per item size:
--   * items whose live stock (all sizes) is at or under their reorder level;
--   * order up to max_stock, or twice the reorder level when no max is set;
--   * an item with several sizes splits the quantity by each size's sales in the period
--     (evenly when nothing sold);
--   * whole packs when the item has a pack unit (alt_uom_factor > 1): 130 pieces of a
--     24-piece case → 144;
--   * last supplier, purchase price, GST and HSN for the purchase order.
-- SECURITY DEFINER with the membership check (same as get_reorder_analysis). Read-only.
-- Safe to run more than once.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS max_stock numeric(14,3);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS reorder_level numeric(14,3);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS alt_uom text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS alt_uom_factor numeric(14,4);

CREATE OR REPLACE FUNCTION public.get_reorder_suggestions(
  p_org_id uuid,
  p_period_days integer DEFAULT 60
)
RETURNS TABLE (
  variant_id uuid,
  product_id uuid,
  product_name text,
  brand text,
  category text,
  size text,
  color text,
  barcode text,
  uom text,
  pack_unit text,
  pack_factor numeric,
  reorder_level numeric,
  max_stock numeric,
  product_stock numeric,
  variant_stock numeric,
  sold_in_period numeric,
  suggested_qty numeric,
  pur_price numeric,
  gst_percent numeric,
  hsn_code text,
  supplier_id uuid,
  supplier_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_period integer;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;
  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated'
         AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid())))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  v_period := GREATEST(7, LEAST(COALESCE(p_period_days, 60), 365));

  RETURN QUERY
  WITH prod AS (
    SELECT p.id, p.product_name, p.brand, p.category, coalesce(p.uom, 'NOS') AS uom,
           p.alt_uom, p.alt_uom_factor, p.reorder_level, p.max_stock,
           coalesce(p.gst_per, 0) AS gst_per, p.hsn_code
    FROM products p
    WHERE p.organization_id = p_org_id
      AND p.deleted_at IS NULL
      AND p.reorder_level IS NOT NULL
      AND p.product_type IS DISTINCT FROM 'service'
      AND p.product_type IS DISTINCT FROM 'combo'
  ),
  vars AS (
    SELECT v.id, v.product_id, v.size, v.color, v.barcode, coalesce(v.stock_qty, 0) AS stock_qty,
           coalesce(v.pur_price, 0) AS pur_price
    FROM product_variants v
    JOIN prod ON prod.id = v.product_id
    WHERE v.organization_id = p_org_id AND v.deleted_at IS NULL AND v.active IS DISTINCT FROM false
  ),
  ptot AS (
    SELECT product_id, sum(stock_qty) AS total, count(*) AS n FROM vars GROUP BY product_id
  ),
  sold AS (
    SELECT si.variant_id, sum(si.quantity)::numeric AS qty
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_org_id
      AND s.deleted_at IS NULL AND si.deleted_at IS NULL
      AND coalesce(s.is_cancelled, false) = false
      AND s.sale_date::date >= CURRENT_DATE - v_period
      AND si.variant_id IN (SELECT id FROM vars)
    GROUP BY si.variant_id
  ),
  psold AS (
    SELECT vars.product_id, sum(coalesce(sold.qty, 0)) AS qty
    FROM vars LEFT JOIN sold ON sold.variant_id = vars.id
    GROUP BY vars.product_id
  ),
  last_sup AS (
    SELECT DISTINCT ON (vars.product_id)
      vars.product_id, pb.supplier_id, coalesce(sup.supplier_name, pb.supplier_name) AS supplier_name
    FROM purchase_items pi
    JOIN purchase_bills pb ON pb.id = pi.bill_id
    JOIN vars ON vars.id = pi.sku_id
    LEFT JOIN suppliers sup ON sup.id = pb.supplier_id
    WHERE pb.organization_id = p_org_id
      AND pb.deleted_at IS NULL AND pi.deleted_at IS NULL
      AND coalesce(pb.is_cancelled, false) = false
    ORDER BY vars.product_id, pb.bill_date DESC, pb.created_at DESC
  ),
  need AS (
    SELECT prod.id AS product_id,
           greatest(0, coalesce(prod.max_stock, prod.reorder_level * 2) - ptot.total) AS qty
    FROM prod JOIN ptot ON ptot.product_id = prod.id
    WHERE ptot.total <= prod.reorder_level
  ),
  split AS (
    SELECT vars.*, need.qty AS product_need,
           CASE
             WHEN coalesce(psold.qty, 0) > 0 THEN coalesce(sold.qty, 0) / psold.qty
             ELSE 1.0 / ptot.n
           END AS share,
           coalesce(sold.qty, 0) AS sold_qty
    FROM vars
    JOIN need ON need.product_id = vars.product_id
    JOIN ptot ON ptot.product_id = vars.product_id
    LEFT JOIN psold ON psold.product_id = vars.product_id
    LEFT JOIN sold ON sold.variant_id = vars.id
    WHERE need.qty > 0
  )
  SELECT
    split.id, prod.id, prod.product_name, prod.brand, prod.category, split.size, split.color, split.barcode,
    prod.uom, prod.alt_uom,
    CASE WHEN coalesce(prod.alt_uom_factor, 0) > 1 THEN prod.alt_uom_factor ELSE NULL END,
    prod.reorder_level, prod.max_stock, ptot.total, split.stock_qty, split.sold_qty,
    CASE
      WHEN coalesce(prod.alt_uom_factor, 0) > 1
        THEN ceil(ceil(split.product_need * split.share) / prod.alt_uom_factor) * prod.alt_uom_factor
      ELSE ceil(split.product_need * split.share)
    END,
    split.pur_price, prod.gst_per, prod.hsn_code, last_sup.supplier_id, last_sup.supplier_name
  FROM split
  JOIN prod ON prod.id = split.product_id
  JOIN ptot ON ptot.product_id = split.product_id
  LEFT JOIN last_sup ON last_sup.product_id = split.product_id
  WHERE ceil(split.product_need * split.share) > 0
  ORDER BY last_sup.supplier_name NULLS LAST, prod.product_name, split.size;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reorder_suggestions(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_reorder_suggestions(uuid, integer) TO authenticated, service_role;

-- Checks (read-only) after running:
--   SELECT count(*) FROM public.products WHERE reorder_level IS NOT NULL;
