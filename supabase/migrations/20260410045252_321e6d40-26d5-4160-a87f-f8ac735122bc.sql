
CREATE OR REPLACE FUNCTION public.reconcile_customer_balances(p_organization_id UUID)
RETURNS TABLE(
  customer_id UUID,
  customer_name TEXT,
  phone TEXT,
  total_invoices NUMERIC,
  total_cash_payments NUMERIC,
  total_advances NUMERIC,
  total_advance_used NUMERIC,
  total_sale_returns NUMERIC,
  total_refunds_paid NUMERIC,
  calculated_balance NUMERIC,
  advance_available NUMERIC,
  notes TEXT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  WITH 
  invoices AS (
    SELECT customer_id, 
      SUM(net_amount + COALESCE(sale_return_adjust, 0)) AS total
    FROM sales
    WHERE organization_id = p_organization_id
      AND deleted_at IS NULL
      AND payment_status != 'cancelled'
      AND customer_id IS NOT NULL
    GROUP BY customer_id
  ),
  cash_payments AS (
    SELECT s.customer_id, SUM(ve.total_amount) AS total
    FROM voucher_entries ve
    JOIN sales s ON s.id = ve.reference_id
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND ve.voucher_type = 'receipt'
      AND ve.reference_type = 'sale'
      AND COALESCE(ve.payment_method, '') NOT IN ('advance_adjustment', 'credit_note_adjustment')
      AND LOWER(COALESCE(ve.description, '')) NOT LIKE '%adjusted from advance balance%'
      AND LOWER(COALESCE(ve.description, '')) NOT LIKE '%credit note adjusted%'
    GROUP BY s.customer_id
  ),
  opening_payments AS (
    SELECT ve.reference_id::UUID AS customer_id, SUM(ve.total_amount) AS total
    FROM voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND ve.voucher_type = 'receipt'
      AND ve.reference_type = 'customer'
      AND LOWER(COALESCE(ve.description, '')) NOT LIKE '%adjusted from advance balance%'
      AND LOWER(COALESCE(ve.description, '')) NOT LIKE '%credit note adjusted%'
    GROUP BY ve.reference_id
  ),
  advances AS (
    SELECT customer_id, 
      SUM(amount) AS total_amount,
      SUM(used_amount) AS total_used
    FROM customer_advances
    WHERE organization_id = p_organization_id
    GROUP BY customer_id
  ),
  returns AS (
    SELECT customer_id, SUM(net_amount) AS total
    FROM sale_returns
    WHERE organization_id = p_organization_id
      AND deleted_at IS NULL
      AND customer_id IS NOT NULL
    GROUP BY customer_id
  ),
  refunds AS (
    SELECT ca.customer_id, SUM(ar.refund_amount) AS total
    FROM advance_refunds ar
    JOIN customer_advances ca ON ca.id = ar.advance_id
    WHERE ca.organization_id = p_organization_id
    GROUP BY ca.customer_id
  ),
  customers AS (
    SELECT id, customer_name, phone, COALESCE(opening_balance, 0) AS opening_balance
    FROM customers
    WHERE organization_id = p_organization_id
      AND deleted_at IS NULL
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
    COALESCE(rf.total, 0) AS total_refunds_paid,
    (c.opening_balance + COALESCE(i.total, 0) - COALESCE(cp.total, 0) - COALESCE(op.total, 0) 
     - COALESCE(a.total_amount, 0) - COALESCE(r.total, 0) + COALESCE(rf.total, 0))::NUMERIC AS calculated_balance,
    GREATEST(0, COALESCE(a.total_amount, 0) - COALESCE(a.total_used, 0) - COALESCE(rf.total, 0))::NUMERIC AS advance_available,
    CASE 
      WHEN (c.opening_balance + COALESCE(i.total, 0) - COALESCE(cp.total, 0) - COALESCE(op.total, 0) 
           - COALESCE(a.total_amount, 0) - COALESCE(r.total, 0) + COALESCE(rf.total, 0)) > 0 
      THEN 'Dr (Customer owes)'
      WHEN (c.opening_balance + COALESCE(i.total, 0) - COALESCE(cp.total, 0) - COALESCE(op.total, 0) 
           - COALESCE(a.total_amount, 0) - COALESCE(r.total, 0) + COALESCE(rf.total, 0)) < 0 
      THEN 'Cr (Overpaid/Advance)'
      ELSE 'Settled'
    END AS notes
  FROM customers c
  LEFT JOIN invoices i ON i.customer_id = c.id
  LEFT JOIN cash_payments cp ON cp.customer_id = c.id
  LEFT JOIN opening_payments op ON op.customer_id = c.id
  LEFT JOIN advances a ON a.customer_id = c.id
  LEFT JOIN returns r ON r.customer_id = c.id
  LEFT JOIN refunds rf ON rf.customer_id = c.id
  WHERE COALESCE(i.total, 0) > 0 OR COALESCE(a.total_amount, 0) > 0
  ORDER BY c.customer_name;
$$;
