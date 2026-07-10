CREATE INDEX IF NOT EXISTS idx_products_style_trgm
  ON public.products USING gin (style extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_category_trgm
  ON public.products USING gin (category extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.search_invoice_sale_ids(
  p_org_id uuid,
  p_search text,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_limit int DEFAULT 1000
) RETURNS TABLE(sale_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_org_member(p_org_id);

  IF p_search IS NULL OR length(btrim(p_search)) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT DISTINCT s.id
    FROM public.sales s
    JOIN public.sale_items si ON si.sale_id = s.id
    LEFT JOIN public.products p ON p.id = si.product_id
    WHERE s.organization_id = p_org_id
      AND s.sale_type = 'invoice'
      AND s.deleted_at IS NULL
      AND si.deleted_at IS NULL
      AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
      AND (p_date_to   IS NULL OR s.sale_date <= p_date_to)
      AND (
           si.product_name ILIKE '%' || p_search || '%'
        OR si.barcode      ILIKE '%' || p_search || '%'
        OR si.size         ILIKE '%' || p_search || '%'
        OR si.color        ILIKE '%' || p_search || '%'
        OR p.style         ILIKE '%' || p_search || '%'
        OR p.category      ILIKE '%' || p_search || '%'
        OR p.brand         ILIKE '%' || p_search || '%'
      )
    LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_invoice_sale_ids(uuid, text, date, date, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_invoice_sale_ids(uuid, text, date, date, int) TO authenticated;