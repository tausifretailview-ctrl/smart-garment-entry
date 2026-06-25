-- Add total_sales to org receivables summary for Customer Ledger KPI cards (fast mount).
CREATE OR REPLACE FUNCTION public.get_organization_receivables_summary(p_organization_id uuid)
 RETURNS TABLE(
   customer_count integer,
   customers_owing integer,
   customers_in_credit integer,
   gross_receivable_dr numeric,
   customer_credit_pool_cr numeric,
   net_receivable numeric,
   advance_available numeric,
   total_sales numeric
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
  items AS (
    SELECT si.sale_id, SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0)) AS gross
    FROM public.sale_items si
    JOIN public.sales s2 ON s2.id = si.sale_id
    WHERE s2.organization_id = p_organization_id
      AND si.deleted_at IS NULL
    GROUP BY si.sale_id
  ),
  receipt_per_sale AS (
    SELECT ve.reference_id AS sale_id,
           SUM(GREATEST(0::numeric, COALESCE(ve.total_amount,0) + COALESCE(ve.discount_amount,0))) AS recd
    FROM public.voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type,'')) = 'receipt'
      AND NOT (
        lower(COALESCE(ve.reference_type,'')) = 'sale'
        AND (lower(COALESCE(ve.payment_method,'')) = 'advance_adjustment'
             OR lower(trim(COALESCE(ve.description,''))) LIKE 'adjusted from advance balance%')
      )
    GROUP BY ve.reference_id
  ),
  sale_components AS (
    SELECT s.id AS sale_id,
      s.customer_id,
      s.sale_return_adjust,
      s.net_amount
        + CASE
            WHEN COALESCE(it.gross,0) > 0
                 AND COALESCE(s.sale_return_adjust,0) > 0
                 AND s.net_amount + COALESCE(s.sale_return_adjust,0) > it.gross + 1
            THEN 0
            ELSE COALESCE(s.sale_return_adjust,0)
          END AS invoiced,
      COALESCE(rps.recd, 0) AS receipts_on_sale,
      GREATEST(
        0::numeric,
        GREATEST(COALESCE(s.paid_amount,0),
                 GREATEST(COALESCE(s.cash_amount,0),0)
                 + GREATEST(COALESCE(s.card_amount,0),0)
                 + GREATEST(COALESCE(s.upi_amount,0),0))
        - COALESCE(rps.recd, 0)
      ) AS pos_drift
    FROM public.sales s
    LEFT JOIN items it ON it.sale_id = s.id
    LEFT JOIN receipt_per_sale rps ON rps.sale_id = s.id
    WHERE s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled,false) = false
      AND lower(COALESCE(s.payment_status,'')) NOT IN ('cancelled','hold')
      AND s.customer_id IS NOT NULL
  ),
  inv AS (
    SELECT customer_id,
      SUM(invoiced) AS invoiced,
      SUM(receipts_on_sale) AS receipts_on_sale,
      SUM(pos_drift) AS pos_drift
    FROM sale_components
    GROUP BY customer_id
  ),
  open_recv AS (
    SELECT ve.reference_id AS customer_id,
      SUM(GREATEST(0::numeric, COALESCE(ve.total_amount,0) + COALESCE(ve.discount_amount,0))) AS total
    FROM public.voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type,'')) = 'receipt'
      AND lower(COALESCE(ve.reference_type,'')) = 'customer'
      AND NOT EXISTS (
        SELECT 1 FROM public.sales s2 WHERE s2.id = ve.reference_id
      )
    GROUP BY ve.reference_id
  ),
  pending_ret AS (
    SELECT sr.customer_id,
      SUM(GREATEST(0::numeric,
        COALESCE(sr.net_amount,0) - COALESCE(s.sale_return_adjust, 0)
      )) AS total
    FROM public.sale_returns sr
    LEFT JOIN public.sales s ON s.id = sr.linked_sale_id
      AND s.organization_id = p_organization_id AND s.deleted_at IS NULL
    WHERE sr.organization_id = p_organization_id
      AND sr.deleted_at IS NULL
      AND sr.customer_id IS NOT NULL
      AND lower(trim(COALESCE(sr.credit_status,''))) = 'pending'
    GROUP BY sr.customer_id
  ),
  cn_vouch AS (
    SELECT ve.reference_id AS customer_id,
      SUM(GREATEST(0::numeric, COALESCE(ve.total_amount,0) + COALESCE(ve.discount_amount,0))) AS total
    FROM public.voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type,'')) = 'credit_note'
      AND lower(COALESCE(ve.reference_type,'')) = 'customer'
    GROUP BY ve.reference_id
  ),
  pay_vouch AS (
    SELECT ve.reference_id AS customer_id,
      SUM(GREATEST(0::numeric, COALESCE(ve.total_amount,0))) AS total
    FROM public.voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type,'')) = 'payment'
      AND lower(COALESCE(ve.reference_type,'')) = 'customer'
    GROUP BY ve.reference_id
  ),
  adv AS (
    SELECT ca.customer_id, SUM(ca.amount) AS amt, SUM(ca.used_amount) AS used
    FROM public.customer_advances ca
    WHERE ca.organization_id = p_organization_id
    GROUP BY ca.customer_id
  ),
  adv_ref AS (
    SELECT ca.customer_id, SUM(ar.refund_amount) AS total
    FROM public.advance_refunds ar
    JOIN public.customer_advances ca ON ca.id = ar.advance_id
    WHERE ca.organization_id = p_organization_id
    GROUP BY ca.customer_id
  ),
  adj AS (
    SELECT cba.customer_id, SUM(cba.outstanding_difference) AS total
    FROM public.customer_balance_adjustments cba
    WHERE cba.organization_id = p_organization_id
    GROUP BY cba.customer_id
  ),
  sales_total AS (
    SELECT ROUND(
      COALESCE(SUM(invoiced - COALESCE(sale_return_adjust, 0)), 0)::numeric,
      2
    ) AS total
    FROM sale_components
  ),
  per_cust AS (
    SELECT
      c.id AS customer_id,
      ( COALESCE(c.opening_balance,0)
        + COALESCE(adj.total,0)
        + COALESCE(inv.invoiced,0)
        - COALESCE(inv.receipts_on_sale,0)
        - COALESCE(open_recv.total,0)
        - COALESCE(inv.pos_drift,0)
        - COALESCE(pending_ret.total,0)
        - COALESCE(cn_vouch.total,0)
        - COALESCE(pay_vouch.total,0)
        - COALESCE(adv.used,0)
        - GREATEST(0::numeric, COALESCE(adv.amt,0) - COALESCE(adv.used,0) - COALESCE(adv_ref.total,0))
      )::numeric AS calc_bal,
      GREATEST(0::numeric, COALESCE(adv.amt,0) - COALESCE(adv.used,0) - COALESCE(adv_ref.total,0))::numeric AS adv_avail
    FROM public.customers c
    LEFT JOIN inv         ON inv.customer_id        = c.id
    LEFT JOIN open_recv   ON open_recv.customer_id  = c.id
    LEFT JOIN pending_ret ON pending_ret.customer_id= c.id
    LEFT JOIN cn_vouch    ON cn_vouch.customer_id   = c.id
    LEFT JOIN pay_vouch   ON pay_vouch.customer_id  = c.id
    LEFT JOIN adv         ON adv.customer_id        = c.id
    LEFT JOIN adv_ref     ON adv_ref.customer_id    = c.id
    LEFT JOIN adj         ON adj.customer_id        = c.id
    WHERE c.organization_id = p_organization_id
      AND c.deleted_at IS NULL
      AND (
        COALESCE(inv.invoiced,0) > 0
        OR COALESCE(adv.amt,0) > 0
        OR COALESCE(c.opening_balance,0) <> 0
        OR COALESCE(open_recv.total,0) > 0
        OR COALESCE(pending_ret.total,0) > 0
        OR COALESCE(cn_vouch.total,0) > 0
        OR COALESCE(pay_vouch.total,0) > 0
        OR COALESCE(adj.total,0) <> 0
      )
  )
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE calc_bal > 0.5)::int,
    COUNT(*) FILTER (WHERE calc_bal < -0.5)::int,
    ROUND(COALESCE(SUM(GREATEST(calc_bal,0)),0)::numeric, 2),
    ROUND(COALESCE(SUM(GREATEST(-calc_bal,0)),0)::numeric, 2),
    ROUND(COALESCE(SUM(calc_bal),0)::numeric, 2),
    ROUND(COALESCE(SUM(adv_avail),0)::numeric, 2),
    (SELECT total FROM sales_total)
  FROM per_cust;
$function$;

GRANT EXECUTE ON FUNCTION public.get_organization_receivables_summary(uuid) TO authenticated, service_role;
