-- Sales Dashboard list reconcile: Σ(mrp × qty) per sale without returning line rows.

CREATE OR REPLACE FUNCTION public.get_sale_items_gross_batch(p_sale_ids uuid[])
RETURNS TABLE(sale_id uuid, items_gross numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    si.sale_id,
    SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0))::numeric AS items_gross
  FROM sale_items si
  WHERE si.sale_id = ANY (COALESCE(p_sale_ids, ARRAY[]::uuid[]))
    AND si.deleted_at IS NULL
  GROUP BY si.sale_id;
$$;

COMMENT ON FUNCTION public.get_sale_items_gross_batch(uuid[]) IS
  'Returns merchandise gross (Σ mrp × qty) per sale for dashboard balance reconcile. '
  'One row per sale_id; no line-item payload.';

GRANT EXECUTE ON FUNCTION public.get_sale_items_gross_batch(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sale_items_gross_batch(uuid[]) TO service_role;
