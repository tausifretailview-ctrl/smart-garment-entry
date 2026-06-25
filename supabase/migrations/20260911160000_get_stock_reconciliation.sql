-- Read-only stock reconciliation: stored stock_qty vs transaction-history recompute.
-- Canonical formula (matches reconcile_variant_stock_qty / Phase 0 diagnosis):
--   opening_qty + purchases - sales - purchase_returns + sale_returns - pending_dc
-- Replaces broken detect_stock_discrepancies (20260422081353 wrong column names).

CREATE OR REPLACE FUNCTION public._get_stock_reconciliation_rows(p_organization_id uuid)
RETURNS TABLE (
  out_variant_id uuid,
  out_barcode text,
  out_product_name text,
  out_size text,
  out_color text,
  out_stored_stock_qty numeric,
  out_opening_qty numeric,
  out_purchases numeric,
  out_sales numeric,
  out_purchase_returns numeric,
  out_sale_returns numeric,
  out_pending_dc numeric,
  out_recomputed_stock_qty numeric,
  out_drift numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH
  purchased AS (
    SELECT
      pi.sku_id AS variant_id,
      COALESCE(SUM(pi.qty), 0)::numeric AS qty
    FROM public.purchase_items pi
    INNER JOIN public.purchase_bills pb ON pb.id = pi.bill_id
    WHERE pb.organization_id = p_organization_id
      AND pi.deleted_at IS NULL
      AND pb.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
    GROUP BY pi.sku_id
  ),
  sold AS (
    SELECT
      si.variant_id,
      COALESCE(SUM(si.quantity), 0)::numeric AS qty
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_organization_id
      AND si.deleted_at IS NULL
      AND s.deleted_at IS NULL
      AND si.variant_id IS NOT NULL
    GROUP BY si.variant_id
  ),
  purchase_returned AS (
    SELECT
      pri.sku_id AS variant_id,
      COALESCE(SUM(pri.qty), 0)::numeric AS qty
    FROM public.purchase_return_items pri
    INNER JOIN public.purchase_returns pr ON pr.id = pri.return_id
    WHERE pr.organization_id = p_organization_id
      AND pri.deleted_at IS NULL
      AND pr.deleted_at IS NULL
      AND pri.sku_id IS NOT NULL
    GROUP BY pri.sku_id
  ),
  sale_returned AS (
    SELECT
      sri.variant_id,
      COALESCE(SUM(sri.quantity), 0)::numeric AS qty
    FROM public.sale_return_items sri
    INNER JOIN public.sale_returns sr ON sr.id = sri.return_id
    WHERE sr.organization_id = p_organization_id
      AND sri.deleted_at IS NULL
      AND sr.deleted_at IS NULL
      AND sri.variant_id IS NOT NULL
    GROUP BY sri.variant_id
  ),
  pending_challan AS (
    SELECT
      dci.variant_id,
      COALESCE(SUM(dci.quantity), 0)::numeric AS qty
    FROM public.delivery_challan_items dci
    INNER JOIN public.delivery_challans dc ON dc.id = dci.challan_id
    WHERE dc.organization_id = p_organization_id
      AND dci.deleted_at IS NULL
      AND dc.deleted_at IS NULL
      AND dc.converted_to_invoice_id IS NULL
      AND dc.status IS DISTINCT FROM 'cancelled'
      AND dci.variant_id IS NOT NULL
    GROUP BY dci.variant_id
  ),
  variants AS (
    SELECT
      pv.id,
      pv.barcode,
      pv.size,
      pv.color,
      COALESCE(pv.stock_qty, 0)::numeric AS stock_qty,
      COALESCE(pv.opening_qty, 0)::numeric AS opening_qty,
      p.product_name
    FROM public.product_variants pv
    INNER JOIN public.products p ON p.id = pv.product_id
    WHERE pv.organization_id = p_organization_id
      AND pv.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND COALESCE(p.product_type, 'goods') NOT IN ('service', 'combo')
  )
  SELECT
    v.id,
    v.barcode,
    v.product_name,
    v.size,
    v.color,
    v.stock_qty,
    v.opening_qty,
    COALESCE(pu.qty, 0),
    COALESCE(so.qty, 0),
    COALESCE(pr.qty, 0),
    COALESCE(sr.qty, 0),
    COALESCE(pc.qty, 0),
    (
      v.opening_qty
      + COALESCE(pu.qty, 0)
      - COALESCE(so.qty, 0)
      - COALESCE(pr.qty, 0)
      + COALESCE(sr.qty, 0)
      - COALESCE(pc.qty, 0)
    ),
    (
      v.stock_qty
      - (
        v.opening_qty
        + COALESCE(pu.qty, 0)
        - COALESCE(so.qty, 0)
        - COALESCE(pr.qty, 0)
        + COALESCE(sr.qty, 0)
        - COALESCE(pc.qty, 0)
      )
    )
  FROM variants v
  LEFT JOIN purchased pu ON pu.variant_id = v.id
  LEFT JOIN sold so ON so.variant_id = v.id
  LEFT JOIN purchase_returned pr ON pr.variant_id = v.id
  LEFT JOIN sale_returned sr ON sr.variant_id = v.id
  LEFT JOIN pending_challan pc ON pc.variant_id = v.id;
$$;

CREATE OR REPLACE FUNCTION public.get_stock_reconciliation(p_organization_id uuid)
RETURNS TABLE (
  variant_id uuid,
  barcode text,
  product_name text,
  size text,
  color text,
  stored_stock_qty numeric,
  opening_qty numeric,
  purchases numeric,
  sales numeric,
  purchase_returns numeric,
  sale_returns numeric,
  pending_dc numeric,
  recomputed_stock_qty numeric,
  drift numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_organization_id IS NULL
       OR NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    r.out_variant_id,
    r.out_barcode,
    r.out_product_name,
    r.out_size,
    r.out_color,
    r.out_stored_stock_qty,
    r.out_opening_qty,
    r.out_purchases,
    r.out_sales,
    r.out_purchase_returns,
    r.out_sale_returns,
    r.out_pending_dc,
    r.out_recomputed_stock_qty,
    r.out_drift
  FROM public._get_stock_reconciliation_rows(p_organization_id) AS r
  ORDER BY ABS(r.out_drift) DESC, r.out_product_name, r.out_size;
END;
$$;

-- Fix detect_stock_discrepancies: drift rows only, columns for stock_alerts + fix_stock_discrepancies.
DROP FUNCTION IF EXISTS public.detect_stock_discrepancies(uuid);

CREATE OR REPLACE FUNCTION public.detect_stock_discrepancies(p_organization_id uuid)
RETURNS TABLE (
  variant_id uuid,
  barcode text,
  product_name text,
  size text,
  color text,
  current_stock_qty numeric,
  calculated_stock_qty numeric,
  discrepancy numeric,
  opening_qty numeric,
  purchases numeric,
  sales numeric,
  purchase_returns numeric,
  sale_returns numeric,
  pending_dc numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_organization_id IS NULL
       OR NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    r.out_variant_id,
    r.out_barcode,
    r.out_product_name,
    r.out_size,
    r.out_color,
    r.out_stored_stock_qty,
    r.out_recomputed_stock_qty,
    r.out_drift,
    r.out_opening_qty,
    r.out_purchases,
    r.out_sales,
    r.out_purchase_returns,
    r.out_sale_returns,
    r.out_pending_dc
  FROM public._get_stock_reconciliation_rows(p_organization_id) AS r
  WHERE r.out_drift <> 0
  ORDER BY ABS(r.out_drift) DESC, r.out_product_name, r.out_size;
END;
$$;

COMMENT ON FUNCTION public._get_stock_reconciliation_rows(uuid) IS
  'Internal set-based stock reconciliation rows. stored vs opening+purchases-sales-returns-pending_dc.';

COMMENT ON FUNCTION public.get_stock_reconciliation(uuid) IS
  'Read-only stock parity: per variant stored stock_qty vs transaction-history recompute with component breakdown.';

COMMENT ON FUNCTION public.detect_stock_discrepancies(uuid) IS
  'Variants where stored stock_qty drifts from transaction-history recompute (drift <> 0 only).';

GRANT EXECUTE ON FUNCTION public._get_stock_reconciliation_rows(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_stock_reconciliation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.detect_stock_discrepancies(uuid) TO authenticated, service_role;
