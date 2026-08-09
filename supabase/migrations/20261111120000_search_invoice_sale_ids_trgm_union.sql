-- Item 3: index-driven search_invoice_sale_ids (same signature / security).
-- Replace single OR across sales × sale_items × products with per-column
-- trigram ILIKE branches UNIONed together so gin_trgm_ops indexes can be used.
--
-- Results: DISTINCT sale_id (UNION), same org/date/deleted filters, same LIMIT.
-- Per-branch cap = p_limit so each column can contribute up to the final limit
-- before UNION + outer LIMIT.

CREATE INDEX IF NOT EXISTS idx_sale_items_product_name_trgm
  ON public.sale_items USING gin (product_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sale_items_barcode_trgm
  ON public.sale_items USING gin (barcode gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sale_items_size_trgm
  ON public.sale_items USING gin (size gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sale_items_color_trgm
  ON public.sale_items USING gin (color gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.search_invoice_sale_ids(
  p_org_id uuid,
  p_search text,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_limit int DEFAULT 1000
) RETURNS TABLE(sale_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q text;
  v_limit int;
  v_branch_cap int;
BEGIN
  PERFORM public.assert_org_member(p_org_id);

  v_q := btrim(COALESCE(p_search, ''));
  IF v_q = '' THEN
    RETURN;
  END IF;

  v_limit := GREATEST(COALESCE(p_limit, 1000), 1);
  v_branch_cap := v_limit;

  RETURN QUERY
  SELECT u.sale_id
  FROM (
    (
      SELECT s.id AS sale_id
      FROM public.sale_items si
      INNER JOIN public.sales s ON s.id = si.sale_id
      WHERE s.organization_id = p_org_id
        AND s.sale_type = 'invoice'
        AND s.deleted_at IS NULL
        AND si.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND si.product_name ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.sale_items si
      INNER JOIN public.sales s ON s.id = si.sale_id
      WHERE s.organization_id = p_org_id
        AND s.sale_type = 'invoice'
        AND s.deleted_at IS NULL
        AND si.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND si.barcode ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.sale_items si
      INNER JOIN public.sales s ON s.id = si.sale_id
      WHERE s.organization_id = p_org_id
        AND s.sale_type = 'invoice'
        AND s.deleted_at IS NULL
        AND si.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND si.size ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.sale_items si
      INNER JOIN public.sales s ON s.id = si.sale_id
      WHERE s.organization_id = p_org_id
        AND s.sale_type = 'invoice'
        AND s.deleted_at IS NULL
        AND si.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND si.color ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
    UNION
    (
      -- products.style → lines by product_id
      SELECT s.id
      FROM public.products p
      INNER JOIN public.sale_items si ON si.product_id = p.id AND si.deleted_at IS NULL
      INNER JOIN public.sales s ON s.id = si.sale_id
      WHERE p.organization_id = p_org_id
        AND p.deleted_at IS NULL
        AND s.organization_id = p_org_id
        AND s.sale_type = 'invoice'
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND p.style ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.products p
      INNER JOIN public.sale_items si ON si.product_id = p.id AND si.deleted_at IS NULL
      INNER JOIN public.sales s ON s.id = si.sale_id
      WHERE p.organization_id = p_org_id
        AND p.deleted_at IS NULL
        AND s.organization_id = p_org_id
        AND s.sale_type = 'invoice'
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND p.category ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.products p
      INNER JOIN public.sale_items si ON si.product_id = p.id AND si.deleted_at IS NULL
      INNER JOIN public.sales s ON s.id = si.sale_id
      WHERE p.organization_id = p_org_id
        AND p.deleted_at IS NULL
        AND s.organization_id = p_org_id
        AND s.sale_type = 'invoice'
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND p.brand ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
  ) u
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.search_invoice_sale_ids(uuid, text, date, date, int) IS
  'Invoice dashboard line-item sale ids. Per-column trigram ILIKE unions (sale_items + products) with org/date filters; SECURITY DEFINER + assert_org_member.';

REVOKE ALL ON FUNCTION public.search_invoice_sale_ids(uuid, text, date, date, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_invoice_sale_ids(uuid, text, date, date, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_invoice_sale_ids(uuid, text, date, date, int) TO service_role;
