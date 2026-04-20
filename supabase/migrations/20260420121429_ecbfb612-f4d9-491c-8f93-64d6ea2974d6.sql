CREATE OR REPLACE FUNCTION public.reconcile_customer_balances(p_organization_id uuid)
 RETURNS TABLE(customer_id uuid, customer_name text, phone text, total_invoices numeric, total_cash_payments numeric, total_advances numeric, total_advance_used numeric, total_sale_returns numeric, total_refunds_paid numeric, calculated_balance numeric, advance_available numeric, notes text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH 
  inv AS (
    SELECT s.customer_id, 
      SUM(s.net_amount + COALESCE(s.sale_return_adjust, 0)) AS total
    FROM sales s
    WHERE s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND s.payment_status NOT IN ('cancelled', 'hold')
      AND s.customer_id IS NOT NULL
    GROUP BY s.customer_id
  ),
  -- Per-sale receipts split into non-advance vs advance-funded.
  sale_vouch AS (
    SELECT 
      ve.reference_id AS sale_id,
      SUM(CASE WHEN COALESCE(ve.payment_method,'') <> 'advance_adjustment'
                 AND LOWER(COALESCE(ve.description,'')) NOT LIKE '%adjusted from advance balance%'
               THEN ve.total_amount ELSE 0 END) AS non_adv_voucher,
      SUM(CASE WHEN COALESCE(ve.payment_method,'') = 'advance_adjustment'
                 OR LOWER(COALESCE(ve.description,'')) LIKE '%adjusted from advance balance%'
               THEN ve.total_amount ELSE 0 END) AS adv_voucher
    FROM voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND ve.voucher_type = 'receipt'
      AND ve.reference_id IS NOT NULL
    GROUP BY ve.reference_id
  ),
  -- Cash payments per sale: GREATEST of (paid_amount minus advance portion) vs non-advance voucher sum.
  -- This handles drift cases (missing/stale vouchers) without double-counting advance payments.
  cash_pay AS (
    SELECT s.customer_id, 
      SUM(GREATEST(
        COALESCE(s.paid_amount, 0) - COALESCE(sv.adv_voucher, 0),
        COALESCE(sv.non_adv_voucher, 0)
      )) AS total
    FROM sales s
    LEFT JOIN sale_vouch sv ON sv.sale_id = s.id
    WHERE s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND s.payment_status NOT IN ('cancelled', 'hold')
      AND s.customer_id IS NOT NULL
    GROUP BY s.customer_id
  ),
  open_pay AS (
    SELECT ve.reference_id AS cust_id, SUM(ve.total_amount) AS total
    FROM voucher_entries ve
    JOIN customers c ON c.id = ve.reference_id
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND ve.voucher_type = 'receipt'
      AND ve.reference_type = 'customer'
      AND c.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM sales s2 WHERE s2.id = ve.reference_id)
      AND COALESCE(ve.payment_method, '') <> 'advance_adjustment'
      AND LOWER(COALESCE(ve.description, '')) NOT LIKE '%adjusted from advance balance%'
    GROUP BY ve.reference_id
  ),
  adv AS (
    SELECT ca.customer_id, 
      SUM(ca.amount) AS total_amount,
      SUM(ca.used_amount) AS total_used
    FROM customer_advances ca
    WHERE ca.organization_id = p_organization_id
    GROUP BY ca.customer_id
  ),
  ret AS (
    SELECT sr.customer_id, SUM(sr.net_amount) AS total
    FROM sale_returns sr
    WHERE sr.organization_id = p_organization_id
      AND sr.deleted_at IS NULL
      AND sr.customer_id IS NOT NULL
    GROUP BY sr.customer_id
  ),
  adv_ref AS (
    SELECT ca.customer_id, SUM(ar.refund_amount) AS total
    FROM advance_refunds ar
    JOIN customer_advances ca ON ca.id = ar.advance_id
    WHERE ca.organization_id = p_organization_id
    GROUP BY ca.customer_id
  ),
  ref_vouch AS (
    SELECT ve.reference_id AS cust_id, SUM(ve.total_amount) AS total
    FROM voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND ve.voucher_type = 'payment'
      AND ve.reference_type = 'customer'
    GROUP BY ve.reference_id
  ),
  adj AS (
    SELECT cba.customer_id, SUM(cba.outstanding_difference) AS total
    FROM customer_balance_adjustments cba
    WHERE cba.organization_id = p_organization_id
    GROUP BY cba.customer_id
  ),
  cust AS (
    SELECT cu.id, cu.customer_name, cu.phone, COALESCE(cu.opening_balance, 0) AS opening_balance
    FROM customers cu
    WHERE cu.organization_id = p_organization_id
      AND cu.deleted_at IS NULL
  )
  SELECT 
    c.id AS customer_id,
    c.customer_name,
    c.phone,
    COALESCE(i.total, 0) AS total_invoices,
    COALESCE(cp.total, 0) + COALESCE(op.total, 0) AS total_cash_payments,
    COALESCE(a.total_amount, 0) AS total_advances,
    COALESCE(a.total_used, 0) AS total_advance_used,
    COALESCE(r.total, 0) AS total_sale_returns,
    COALESCE(arf.total, 0) + COALESCE(rv.total, 0) AS total_refunds_paid,
    (c.opening_balance 
     + COALESCE(i.total, 0) 
     - COALESCE(cp.total, 0) - COALESCE(op.total, 0) 
     - COALESCE(a.total_used, 0) 
     - COALESCE(r.total, 0) 
     + COALESCE(arf.total, 0) + COALESCE(rv.total, 0)
     + COALESCE(adj_t.total, 0)
    )::numeric AS calculated_balance,
    GREATEST(0, COALESCE(a.total_amount, 0) - COALESCE(a.total_used, 0) - COALESCE(arf.total, 0)) AS advance_available,
    NULL::text AS notes
  FROM cust c
  LEFT JOIN inv i ON i.customer_id = c.id
  LEFT JOIN cash_pay cp ON cp.customer_id = c.id
  LEFT JOIN open_pay op ON op.cust_id = c.id
  LEFT JOIN adv a ON a.customer_id = c.id
  LEFT JOIN ret r ON r.customer_id = c.id
  LEFT JOIN adv_ref arf ON arf.customer_id = c.id
  LEFT JOIN ref_vouch rv ON rv.cust_id = c.id
  LEFT JOIN adj adj_t ON adj_t.customer_id = c.id;
$function$;