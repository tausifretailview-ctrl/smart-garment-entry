-- Product delete: stop blocking products whose purchase line was deleted.
--
-- Before: deleting a line from a purchase bill reversed its stock (purchase +qty,
-- purchase_delete -qty) but both stock_movements rows stayed, and
-- _product_has_active_references treated ANY stock movement as a live reference.
-- The product could then never be deleted ("Nothing deleted: still have stock or
-- live transactions"), even with stock 0 and no bills.
-- Service / combo products carry virtual stock 999999, so _product_is_orphan also
-- rejected them forever.
--
-- After:
--   * movements for a (bill, variant) are ignored when they are all purchase
--     movements, net to zero, and no purchase line for that bill + variant remains.
--     Lines on recycled (soft-deleted) bills still exist, so those still block.
--   * batch_stock rows only block when quantity <> 0.
--   * service / combo virtual stock counts as 0 for orphan / delete checks.

CREATE OR REPLACE FUNCTION public._stock_movement_is_reversed_purchase_line(
  p_reference_id uuid,
  p_variant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_reference_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.purchase_items pi
      WHERE pi.bill_id = p_reference_id
        AND pi.sku_id = p_variant_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.reference_id = p_reference_id
        AND sm.variant_id = p_variant_id
        AND sm.movement_type NOT IN (
          'purchase', 'purchase_delete', 'purchase_increase', 'purchase_decrease',
          'purchase_sku_change_in', 'purchase_sku_change_out', 'purchase_edit',
          'soft_delete_purchase', 'restore_purchase'
        )
    )
    AND COALESCE((
      SELECT SUM(sm.quantity)
      FROM public.stock_movements sm
      WHERE sm.reference_id = p_reference_id
        AND sm.variant_id = p_variant_id
    ), 0) = 0;
$$;

COMMENT ON FUNCTION public._stock_movement_is_reversed_purchase_line(uuid, uuid) IS
  'True when every stock movement for (bill, variant) is a purchase movement, they net to zero, and no purchase line for that bill + variant exists any more (line deleted from the bill).';

CREATE OR REPLACE FUNCTION public._product_has_active_references(
  p_organization_id uuid,
  p_product_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.purchase_items pi
      JOIN public.purchase_bills pb ON pb.id = pi.bill_id
      WHERE pi.product_id = p_product_id
        AND pi.deleted_at IS NULL
        AND pb.deleted_at IS NULL
        AND pb.organization_id = p_organization_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.purchase_order_items poi
      JOIN public.purchase_orders po ON po.id = poi.order_id
      WHERE poi.product_id = p_product_id
        AND poi.deleted_at IS NULL
        AND po.deleted_at IS NULL
        AND po.organization_id = p_organization_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.sale_items si
      JOIN public.sales s ON s.id = si.sale_id
      WHERE si.product_id = p_product_id
        AND si.deleted_at IS NULL
        AND s.deleted_at IS NULL
        AND s.organization_id = p_organization_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.sale_return_items sri
      JOIN public.sale_returns sr ON sr.id = sri.return_id
      WHERE sri.product_id = p_product_id
        AND sri.deleted_at IS NULL
        AND sr.deleted_at IS NULL
        AND sr.organization_id = p_organization_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.purchase_return_items pri
      JOIN public.purchase_returns pr ON pr.id = pri.return_id
      WHERE pri.product_id = p_product_id
        AND pri.deleted_at IS NULL
        AND pr.deleted_at IS NULL
        AND pr.organization_id = p_organization_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.quotation_items qi
      JOIN public.quotations q ON q.id = qi.quotation_id
      WHERE qi.product_id = p_product_id
        AND qi.deleted_at IS NULL
        AND q.deleted_at IS NULL
        AND q.organization_id = p_organization_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.sale_order_items soi
      JOIN public.sale_orders so ON so.id = soi.order_id
      WHERE soi.product_id = p_product_id
        AND soi.deleted_at IS NULL
        AND so.deleted_at IS NULL
        AND so.organization_id = p_organization_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.delivery_challan_items dci
      JOIN public.delivery_challans dc ON dc.id = dci.challan_id
      WHERE dci.product_id = p_product_id
        AND dci.deleted_at IS NULL
        AND dc.deleted_at IS NULL
        AND dc.organization_id = p_organization_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.salesman_commissions sc
      LEFT JOIN public.sales s ON s.id = sc.sale_id
      WHERE sc.organization_id = p_organization_id
        AND sc.product_id IS NOT NULL
        AND sc.product_id = p_product_id::text
        AND (sc.sale_id IS NULL OR s.deleted_at IS NULL)
    )
    OR EXISTS (
      SELECT 1
      FROM public.product_variants pv
      JOIN public.stock_movements sm ON sm.variant_id = pv.id
      WHERE pv.product_id = p_product_id
        AND pv.deleted_at IS NULL
        AND sm.organization_id = p_organization_id
        AND NOT public._stock_movement_is_reversed_purchase_line(sm.reference_id, sm.variant_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.product_variants pv
      JOIN public.batch_stock bs ON bs.variant_id = pv.id
      WHERE pv.product_id = p_product_id
        AND pv.deleted_at IS NULL
        AND bs.organization_id = p_organization_id
        AND COALESCE(bs.quantity, 0) <> 0
    )
    OR EXISTS (
      SELECT 1
      FROM public.product_variants pv
      JOIN public.customer_product_prices cpp ON cpp.variant_id = pv.id
      WHERE pv.product_id = p_product_id
        AND pv.deleted_at IS NULL
        AND cpp.organization_id = p_organization_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.product_images pim
      WHERE pim.product_id = p_product_id
        AND pim.organization_id = p_organization_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.drafts d
      WHERE d.organization_id = p_organization_id
        AND public._draft_references_product(d.draft_data, p_product_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.sales s
      WHERE s.organization_id = p_organization_id
        AND s.deleted_at IS NULL
        AND s.held_cart_data IS NOT NULL
        AND public._held_cart_references_product(s.held_cart_data, p_product_id)
    );
$$;

CREATE OR REPLACE FUNCTION public._product_is_orphan(
  p_organization_id uuid,
  p_product_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.products p
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(
               CASE WHEN COALESCE(p.product_type, 'goods') IN ('service', 'combo') THEN 0
                    ELSE pv.stock_qty END
             ), 0)::numeric AS total_stock
      FROM public.product_variants pv
      WHERE pv.product_id = p.id
        AND pv.deleted_at IS NULL
    ) vs ON true
    WHERE p.id = p_product_id
      AND p.organization_id = p_organization_id
      AND p.deleted_at IS NULL
      AND COALESCE(vs.total_stock, 0) = 0
      AND NOT public._product_has_active_references(p_organization_id, p.id)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_orphaned_products(p_organization_id uuid)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  brand text,
  category text,
  created_at timestamptz,
  total_stock integer,
  user_cancelled_at timestamptz,
  reason text
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
    p.id AS product_id,
    p.product_name,
    p.brand,
    p.category,
    p.created_at,
    COALESCE(vs.total_stock, 0)::integer AS total_stock,
    p.user_cancelled_at,
    CASE
      WHEN p.user_cancelled_at IS NOT NULL THEN 'Line cancelled before save'::text
      ELSE 'Never billed'::text
    END AS reason
  FROM public.products p
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(
             CASE WHEN COALESCE(p.product_type, 'goods') IN ('service', 'combo') THEN 0
                  ELSE pv.stock_qty END
           ), 0)::numeric AS total_stock
    FROM public.product_variants pv
    WHERE pv.product_id = p.id
      AND pv.deleted_at IS NULL
  ) vs ON true
  WHERE p.organization_id = p_organization_id
    AND p.deleted_at IS NULL
    AND COALESCE(vs.total_stock, 0) = 0
    AND NOT public._product_has_active_references(p_organization_id, p.id)
  ORDER BY p.created_at DESC NULLS LAST, p.product_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public._stock_movement_is_reversed_purchase_line(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._product_has_active_references(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._product_is_orphan(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orphaned_products(uuid) TO authenticated;
