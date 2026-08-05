-- Fix get_gst_summary: previously ALWAYS treated si.line_total as tax-inclusive,
-- regardless of the sale's actual tax_type. Branches on s.tax_type now.
--
-- Applied live via Supabase SQL editor (2026-08-06) before this migration file
-- existed. Kept in-repo so migration history matches production (same drift
-- pattern as legacy_paid_baseline). Re-running CREATE OR REPLACE is idempotent.
CREATE OR REPLACE FUNCTION public.get_gst_summary(p_organization_id uuid, p_from_date date, p_to_date date)
 RETURNS TABLE(gst_percent integer, taxable_amount numeric, cgst_amount numeric, sgst_amount numeric, igst_amount numeric, total_amount numeric, invoice_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    si.gst_percent,
    SUM(
      CASE
        WHEN s.tax_type = 'exclusive' THEN si.line_total
        WHEN s.tax_type = 'no_gst' THEN si.line_total
        ELSE si.line_total / (1 + si.gst_percent::numeric/100)
      END
    ) AS taxable_amount,
    SUM(
      CASE
        WHEN s.tax_type = 'no_gst' THEN 0
        WHEN s.tax_type = 'exclusive' THEN si.line_total * (si.gst_percent::numeric/200)
        ELSE si.line_total / (1 + si.gst_percent::numeric/100) * (si.gst_percent::numeric/200)
      END
    ) AS cgst_amount,
    SUM(
      CASE
        WHEN s.tax_type = 'no_gst' THEN 0
        WHEN s.tax_type = 'exclusive' THEN si.line_total * (si.gst_percent::numeric/200)
        ELSE si.line_total / (1 + si.gst_percent::numeric/100) * (si.gst_percent::numeric/200)
      END
    ) AS sgst_amount,
    0::numeric AS igst_amount,
    SUM(
      CASE
        WHEN s.tax_type = 'exclusive' THEN si.line_total * (1 + si.gst_percent::numeric/100)
        ELSE si.line_total
      END
    ) AS total_amount,
    COUNT(DISTINCT si.sale_id) AS invoice_count
  FROM public.sale_items si
  JOIN public.sales s ON s.id = si.sale_id
  WHERE
    s.organization_id = p_organization_id
    AND s.sale_date::date BETWEEN p_from_date AND p_to_date
    AND s.deleted_at IS NULL
    AND si.deleted_at IS NULL
    AND s.is_cancelled = false
    AND s.net_amount >= 0
  GROUP BY si.gst_percent
  ORDER BY si.gst_percent;
$function$;
