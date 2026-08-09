-- Rewrite search_invoice_sale_ids to use EXISTS subqueries so the planner
-- drives from the GIN trigram indexes on sale_items/products instead of
-- scanning all sale_items for each tenant.
CREATE OR REPLACE FUNCTION public.search_invoice_sale_ids(
  p_org_id uuid,
  p_search text,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE(sale_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      FROM public.sales s
      WHERE s.organization_id = p_org_id
        AND s.sale_type = 'invoice'
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND EXISTS (
          SELECT 1 FROM public.sale_items si
          WHERE si.sale_id = s.id
            AND si.deleted_at IS NULL
            AND si.product_name ILIKE '%' || v_q || '%'
        )
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.sales s
      WHERE s.organization_id = p_org_id
        AND s.sale_type = 'invoice'
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND EXISTS (
          SELECT 1 FROM public.sale_items si
          WHERE si.sale_id = s.id
            AND si.deleted_at IS NULL
            AND si.barcode ILIKE '%' || v_q || '%'
        )
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.sales s
      WHERE s.organization_id = p_org_id
        AND s.sale_type = 'invoice'
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND EXISTS (
          SELECT 1 FROM public.sale_items si
          WHERE si.sale_id = s.id
            AND si.deleted_at IS NULL
            AND si.size ILIKE '%' || v_q || '%'
        )
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.sales s
      WHERE s.organization_id = p_org_id
        AND s.sale_type = 'invoice'
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND EXISTS (
          SELECT 1 FROM public.sale_items si
          WHERE si.sale_id = s.id
            AND si.deleted_at IS NULL
            AND si.color ILIKE '%' || v_q || '%'
        )
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.sales s
      WHERE s.organization_id = p_org_id
        AND s.sale_type = 'invoice'
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND EXISTS (
          SELECT 1
          FROM public.sale_items si
          JOIN public.products p ON p.id = si.product_id
          WHERE si.sale_id = s.id
            AND si.deleted_at IS NULL
            AND p.organization_id = p_org_id
            AND p.deleted_at IS NULL
            AND p.style ILIKE '%' || v_q || '%'
        )
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.sales s
      WHERE s.organization_id = p_org_id
        AND s.sale_type = 'invoice'
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND EXISTS (
          SELECT 1
          FROM public.sale_items si
          JOIN public.products p ON p.id = si.product_id
          WHERE si.sale_id = s.id
            AND si.deleted_at IS NULL
            AND p.organization_id = p_org_id
            AND p.deleted_at IS NULL
            AND p.category ILIKE '%' || v_q || '%'
        )
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.sales s
      WHERE s.organization_id = p_org_id
        AND s.sale_type = 'invoice'
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND EXISTS (
          SELECT 1
          FROM public.sale_items si
          JOIN public.products p ON p.id = si.product_id
          WHERE si.sale_id = s.id
            AND si.deleted_at IS NULL
            AND p.organization_id = p_org_id
            AND p.deleted_at IS NULL
            AND p.brand ILIKE '%' || v_q || '%'
        )
      LIMIT v_branch_cap
    )
  ) u
  LIMIT v_limit;
END;
$function$;

-- Rewrite search_pos_sale_ids the same way.
CREATE OR REPLACE FUNCTION public.search_pos_sale_ids(
  p_org_id uuid,
  p_search text,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE(sale_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      FROM public.sales s
      WHERE s.organization_id = p_org_id
        AND s.sale_type IN ('pos', 'delivery_challan')
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND EXISTS (
          SELECT 1 FROM public.sale_items si
          WHERE si.sale_id = s.id
            AND si.deleted_at IS NULL
            AND si.product_name ILIKE '%' || v_q || '%'
        )
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.sales s
      WHERE s.organization_id = p_org_id
        AND s.sale_type IN ('pos', 'delivery_challan')
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND EXISTS (
          SELECT 1 FROM public.sale_items si
          WHERE si.sale_id = s.id
            AND si.deleted_at IS NULL
            AND si.barcode ILIKE '%' || v_q || '%'
        )
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.sales s
      WHERE s.organization_id = p_org_id
        AND s.sale_type IN ('pos', 'delivery_challan')
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND EXISTS (
          SELECT 1 FROM public.sale_items si
          WHERE si.sale_id = s.id
            AND si.deleted_at IS NULL
            AND si.size ILIKE '%' || v_q || '%'
        )
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.sales s
      WHERE s.organization_id = p_org_id
        AND s.sale_type IN ('pos', 'delivery_challan')
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND EXISTS (
          SELECT 1 FROM public.sale_items si
          WHERE si.sale_id = s.id
            AND si.deleted_at IS NULL
            AND si.color ILIKE '%' || v_q || '%'
        )
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.sales s
      WHERE s.organization_id = p_org_id
        AND s.sale_type IN ('pos', 'delivery_challan')
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND EXISTS (
          SELECT 1
          FROM public.sale_items si
          JOIN public.products p ON p.id = si.product_id
          WHERE si.sale_id = s.id
            AND si.deleted_at IS NULL
            AND p.organization_id = p_org_id
            AND p.deleted_at IS NULL
            AND p.style ILIKE '%' || v_q || '%'
        )
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.sales s
      WHERE s.organization_id = p_org_id
        AND s.sale_type IN ('pos', 'delivery_challan')
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND EXISTS (
          SELECT 1
          FROM public.sale_items si
          JOIN public.products p ON p.id = si.product_id
          WHERE si.sale_id = s.id
            AND si.deleted_at IS NULL
            AND p.organization_id = p_org_id
            AND p.deleted_at IS NULL
            AND p.category ILIKE '%' || v_q || '%'
        )
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.sales s
      WHERE s.organization_id = p_org_id
        AND s.sale_type IN ('pos', 'delivery_challan')
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND EXISTS (
          SELECT 1
          FROM public.sale_items si
          JOIN public.products p ON p.id = si.product_id
          WHERE si.sale_id = s.id
            AND si.deleted_at IS NULL
            AND p.organization_id = p_org_id
            AND p.deleted_at IS NULL
            AND p.brand ILIKE '%' || v_q || '%'
        )
      LIMIT v_branch_cap
    )
  ) u
  LIMIT v_limit;
END;
$function$;

-- Organization-scoped composite GIN trigram indexes for products.
-- btree_gin provides uuid_ops for GIN so the leading tenant column can
-- be combined with trigram text columns.
CREATE INDEX IF NOT EXISTS idx_products_org_style_trgm
  ON public.products USING gin (organization_id uuid_ops, style extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_org_category_trgm
  ON public.products USING gin (organization_id uuid_ops, category extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_org_brand_trgm
  ON public.products USING gin (organization_id uuid_ops, brand extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;
