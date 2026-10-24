-- DC (No GST) lines out of the GST reports, from every save path (2026-10-24).
--
-- WHAT IT DOES
--   1. sale_return_items gets is_dc_item (sale_items has had it since 2026-03-23).
--   2. A new sale line or sale return line of a DC product (product_variants.is_dc_product,
--      set by a "DC Purchase (No GST)" bill) is marked is_dc_item = true by the database.
--      Before this only POS set it, so DC items sold on a Sale Bill went into GSTR-1.
--   3. get_gst_summary (GSTR-3B outward supplies) leaves DC lines out, like GSTR-1 already does.
--
-- WHAT IT DOES NOT DO
--   * Old bills and returns are not changed: months already filed keep their numbers.
--   * Nothing changes stock, amounts, journals or prints.
--
-- SAFETY: additive column + BEFORE INSERT triggers that only ever turn the flag on.
-- UNDO:
--   DROP TRIGGER IF EXISTS trg_sale_items_dc_flag_from_variant ON public.sale_items;
--   DROP TRIGGER IF EXISTS trg_sale_return_items_dc_flag_from_variant ON public.sale_return_items;
--   then re-run supabase/migrations/20260806120000_fix_get_gst_summary_tax_type.sql.

ALTER TABLE public.sale_return_items
  ADD COLUMN IF NOT EXISTS is_dc_item boolean DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_line_dc_flag_from_variant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_dc boolean;
BEGIN
  IF COALESCE(NEW.is_dc_item, false) = false AND NEW.variant_id IS NOT NULL THEN
    SELECT pv.is_dc_product INTO v_is_dc
    FROM public.product_variants pv
    WHERE pv.id = NEW.variant_id;
    NEW.is_dc_item := COALESCE(v_is_dc, false);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sale_items_dc_flag_from_variant ON public.sale_items;
CREATE TRIGGER trg_sale_items_dc_flag_from_variant
  BEFORE INSERT ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.set_line_dc_flag_from_variant();

DROP TRIGGER IF EXISTS trg_sale_return_items_dc_flag_from_variant ON public.sale_return_items;
CREATE TRIGGER trg_sale_return_items_dc_flag_from_variant
  BEFORE INSERT ON public.sale_return_items
  FOR EACH ROW EXECUTE FUNCTION public.set_line_dc_flag_from_variant();

-- Same body as 20260806120000_fix_get_gst_summary_tax_type.sql plus the organisation guard
-- (security review 2026-09-27) and "AND DC lines out".
CREATE OR REPLACE FUNCTION public.get_gst_summary(p_organization_id uuid, p_from_date date, p_to_date date)
 RETURNS TABLE(gst_percent integer, taxable_amount numeric, cgst_amount numeric, sgst_amount numeric, igst_amount numeric, total_amount numeric, invoice_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public._assert_org_access(p_organization_id);
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
    AND COALESCE(si.is_dc_item, false) = false
  GROUP BY si.gst_percent
  ORDER BY si.gst_percent;
$function$;
