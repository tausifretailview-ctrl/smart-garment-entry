
CREATE OR REPLACE FUNCTION public.get_gst_summary(
  p_organization_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS TABLE(
  gst_percent INTEGER,
  taxable_amount NUMERIC,
  cgst_amount NUMERIC,
  sgst_amount NUMERIC,
  igst_amount NUMERIC,
  total_amount NUMERIC,
  invoice_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    si.gst_percent,
    SUM(si.line_total / (1 + si.gst_percent::numeric/100)) AS taxable_amount,
    SUM(si.line_total / (1 + si.gst_percent::numeric/100)
        * (si.gst_percent::numeric/200)) AS cgst_amount,
    SUM(si.line_total / (1 + si.gst_percent::numeric/100)
        * (si.gst_percent::numeric/200)) AS sgst_amount,
    0::numeric AS igst_amount,
    SUM(si.line_total) AS total_amount,
    COUNT(DISTINCT si.sale_id) AS invoice_count
  FROM public.sale_items si
  JOIN public.sales s ON s.id = si.sale_id
  WHERE
    s.organization_id = p_organization_id
    AND s.sale_date::date BETWEEN p_from_date AND p_to_date
    AND s.deleted_at IS NULL
    AND si.deleted_at IS NULL
  GROUP BY si.gst_percent
  ORDER BY si.gst_percent;
$$;

GRANT EXECUTE ON FUNCTION public.get_gst_summary(UUID, DATE, DATE) TO authenticated;
