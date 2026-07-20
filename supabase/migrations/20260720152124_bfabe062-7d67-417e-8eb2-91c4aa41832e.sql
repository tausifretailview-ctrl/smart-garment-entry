
CREATE OR REPLACE FUNCTION public.detect_balance_adjustment_drift(
  p_organization_id uuid, p_min_drift numeric DEFAULT 1.0
)
RETURNS TABLE(
  customer_id uuid, customer_name text, ledger_closing numeric,
  invoice_pending_sum numeric, opening_pending numeric,
  floating_adjustment_pool numeric, drift numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = auth.uid() AND om.organization_id = p_organization_id
      AND lower(om.role::text) IN ('admin','owner','platform_admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT DISTINCT cba.customer_id
    FROM public.customer_balance_adjustments cba
    WHERE cba.organization_id = p_organization_id
      AND cba.materialized_at IS NULL
  ),
  ledger AS (
    SELECT c.id AS cid, c.customer_name AS cname,
           COALESCE((SELECT SUM(amount) FROM public.reconcile_customer_balance_v2(c.id, p_organization_id)), 0)::numeric AS closing
    FROM public.customers c
    JOIN candidates ca ON ca.customer_id = c.id
    WHERE c.organization_id = p_organization_id AND c.deleted_at IS NULL
  ),
  invoice_pending AS (
    SELECT s.customer_id,
           SUM(GREATEST(0, s.net_amount - COALESCE((
             SELECT SUM(GREATEST(0, COALESCE(ve.total_amount,0) + COALESCE(ve.discount_amount,0)))
             FROM public.voucher_entries ve
             WHERE ve.organization_id = p_organization_id AND ve.deleted_at IS NULL
               AND lower(COALESCE(ve.voucher_type,'')) = 'receipt' AND ve.reference_id = s.id
           ), 0) - COALESCE(s.sale_return_adjust, 0)))::numeric AS pending_sum
    FROM public.sales s
    JOIN candidates ca ON ca.customer_id = s.customer_id
    WHERE s.organization_id = p_organization_id AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND lower(COALESCE(s.payment_status,'')) NOT IN ('cancelled','hold')
    GROUP BY s.customer_id
  ),
  opening_pending AS (
    SELECT c.id AS cid,
           GREATEST(0, COALESCE(c.opening_balance,0) - COALESCE((
             SELECT SUM(GREATEST(0, COALESCE(ve.total_amount,0) + COALESCE(ve.discount_amount,0)))
             FROM public.voucher_entries ve
             WHERE ve.organization_id = p_organization_id AND ve.deleted_at IS NULL
               AND lower(COALESCE(ve.voucher_type,'')) = 'receipt'
               AND lower(COALESCE(ve.reference_type,'')) = 'customer'
               AND ve.reference_id = c.id
               AND NOT EXISTS (SELECT 1 FROM public.sales s2 WHERE s2.id = ve.reference_id)
           ), 0))::numeric AS pending
    FROM public.customers c
    JOIN candidates ca ON ca.customer_id = c.id
    WHERE c.organization_id = p_organization_id AND c.deleted_at IS NULL
  ),
  floating AS (
    SELECT cba.customer_id, SUM(cba.outstanding_difference)::numeric AS pool
    FROM public.customer_balance_adjustments cba
    WHERE cba.organization_id = p_organization_id AND cba.materialized_at IS NULL
    GROUP BY cba.customer_id
  )
  SELECT l.cid, l.cname, l.closing,
         COALESCE(ip.pending_sum, 0), COALESCE(op.pending, 0),
         COALESCE(f.pool, 0),
         ROUND(ABS(l.closing - (COALESCE(ip.pending_sum,0) + COALESCE(op.pending,0))), 2)
  FROM ledger l
  LEFT JOIN invoice_pending ip ON ip.customer_id = l.cid
  LEFT JOIN opening_pending op ON op.cid = l.cid
  LEFT JOIN floating f ON f.customer_id = l.cid
  WHERE ABS(l.closing - (COALESCE(ip.pending_sum,0) + COALESCE(op.pending,0))) > p_min_drift
  ORDER BY drift DESC;
END;
$fn$;
