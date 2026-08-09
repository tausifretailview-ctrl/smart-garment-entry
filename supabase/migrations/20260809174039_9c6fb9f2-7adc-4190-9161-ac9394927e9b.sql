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
      FROM public.sale_items si
      INNER JOIN public.sales s ON s.id = si.sale_id
      WHERE s.organization_id = p_org_id
        AND s.sale_type IN ('pos', 'delivery_challan')
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
        AND s.sale_type IN ('pos', 'delivery_challan')
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
        AND s.sale_type IN ('pos', 'delivery_challan')
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
        AND s.sale_type IN ('pos', 'delivery_challan')
        AND s.deleted_at IS NULL
        AND si.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND si.color ILIKE '%' || v_q || '%'
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
        AND s.sale_type IN ('pos', 'delivery_challan')
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
        AND s.sale_type IN ('pos', 'delivery_challan')
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
        AND s.sale_type IN ('pos', 'delivery_challan')
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND p.brand ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
  ) u
  LIMIT v_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.search_pos_sale_ids(uuid, text, date, date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_pos_sale_ids(uuid, text, date, date, integer) TO service_role;