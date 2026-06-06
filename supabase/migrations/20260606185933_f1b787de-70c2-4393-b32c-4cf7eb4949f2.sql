DROP FUNCTION IF EXISTS public.reconcile_customer_balances(UUID);

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
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH
  items AS (
    SELECT si.sale_id, SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0)) AS gross
    FROM public.sale_items si
    JOIN public.sales s2 ON s2.id = si.sale_id
    WHERE s2.organization_id = p_organization_id
      AND si.deleted_at IS NULL
    GROUP BY si.sale_id
  ),
  inv AS (
    SELECT s.customer_id,
      SUM(
        s.net_amount
        + CASE
            WHEN COALESCE(it.gross, 0) > 0
                 AND COALESCE(s.sale_return_adjust, 0) > 0
                 AND s.net_amount + COALESCE(s.sale_return_adjust, 0) > it.gross + 1
            THEN 0
            ELSE COALESCE(s.sale_return_adjust, 0)
          END
      ) AS total
    FROM public.sales s
    LEFT JOIN items it ON it.sale_id = s.id
    WHERE s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND s.payment_status NOT IN ('cancelled', 'hold')
      AND s.customer_id IS NOT NULL
    GROUP BY s.customer_id
  ),
  cash_pay AS (
    SELECT s.customer_id, SUM(ve.total_amount + COALESCE(ve.discount_amount, 0)) AS total
    FROM public.voucher_entries ve
    JOIN public.sales s ON s.id = ve.reference_id
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND ve.voucher_type = 'receipt'
      AND ve.reference_type IN ('sale','SALE','customer','customer_payment','CustomerReceipt')
      AND s.deleted_at IS NULL
      AND s.payment_status NOT IN ('cancelled', 'hold')
      AND COALESCE(ve.payment_method, '') NOT IN ('advance_adjustment', 'credit_note_adjustment')
      AND LOWER(COALESCE(ve.description, '')) NOT LIKE '%adjusted from advance balance%'
      AND LOWER(COALESCE(ve.description, '')) NOT LIKE '%credit note adjusted%'
    GROUP BY s.customer_id
  ),
  open_pay AS (
    SELECT ve.reference_id AS cust_id, SUM(ve.total_amount + COALESCE(ve.discount_amount, 0)) AS total
    FROM public.voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND ve.voucher_type = 'receipt'
      AND ve.reference_type IN ('customer','customer_payment','CustomerReceipt')
      AND LOWER(COALESCE(ve.description, '')) NOT LIKE '%adjusted from advance balance%'
      AND LOWER(COALESCE(ve.description, '')) NOT LIKE '%credit note adjusted%'
      AND NOT EXISTS (
        SELECT 1 FROM public.sales s2
        WHERE s2.organization_id = p_organization_id
          AND s2.deleted_at IS NULL
          AND s2.id::text = ve.reference_id::text
      )
    GROUP BY ve.reference_id
  ),
  adv AS (
    SELECT ca.customer_id,
      SUM(ca.amount) AS total_amount,
      SUM(ca.used_amount) AS total_used
    FROM public.customer_advances ca
    WHERE ca.organization_id = p_organization_id
    GROUP BY ca.customer_id
  ),
  ret AS (
    SELECT sr.customer_id, SUM(sr.net_amount) AS total
    FROM public.sale_returns sr
    LEFT JOIN public.sales s ON s.id = sr.linked_sale_id
    WHERE sr.organization_id = p_organization_id
      AND sr.deleted_at IS NULL
      AND sr.customer_id IS NOT NULL
      AND (
        s.id IS NULL
        OR (s.deleted_at IS NULL AND s.payment_status NOT IN ('cancelled', 'hold'))
      )
    GROUP BY sr.customer_id
  ),
  adv_ref AS (
    SELECT ca.customer_id, SUM(ar.refund_amount) AS total
    FROM public.advance_refunds ar
    JOIN public.customer_advances ca ON ca.id = ar.advance_id
    WHERE ca.organization_id = p_organization_id
    GROUP BY ca.customer_id
  ),
  ref_vouch AS (
    SELECT ve.reference_id AS cust_id, SUM(ve.total_amount) AS total
    FROM public.voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND ve.voucher_type = 'payment'
      AND ve.reference_type = 'customer'
    GROUP BY ve.reference_id
  ),
  adj AS (
    SELECT cba.customer_id, SUM(cba.outstanding_difference) AS total
    FROM public.customer_balance_adjustments cba
    WHERE cba.organization_id = p_organization_id
    GROUP BY cba.customer_id
  ),
  cust AS (
    SELECT cu.id, cu.customer_name, cu.phone, COALESCE(cu.opening_balance, 0) AS opening_balance
    FROM public.customers cu
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
    public.get_customer_true_outstanding(c.id, p_organization_id)::NUMERIC AS calculated_balance,
    GREATEST(0, COALESCE(a.total_amount, 0) - COALESCE(a.total_used, 0) - COALESCE(arf.total, 0))::NUMERIC AS advance_available,
    CASE
      WHEN public.get_customer_true_outstanding(c.id, p_organization_id) > 0.5
      THEN 'Dr (Customer owes)'
      WHEN public.get_customer_true_outstanding(c.id, p_organization_id) < -0.5
      THEN 'Cr (Overpaid/Advance)'
      ELSE 'Settled'
    END AS notes
  FROM cust c
  LEFT JOIN inv i ON i.customer_id = c.id
  LEFT JOIN cash_pay cp ON cp.customer_id = c.id
  LEFT JOIN open_pay op ON op.cust_id = c.id
  LEFT JOIN adv a ON a.customer_id = c.id
  LEFT JOIN ret r ON r.customer_id = c.id
  LEFT JOIN adv_ref arf ON arf.customer_id = c.id
  LEFT JOIN ref_vouch rv ON rv.cust_id = c.id
  LEFT JOIN adj ad ON ad.customer_id = c.id
  WHERE COALESCE(i.total, 0) > 0
     OR COALESCE(a.total_amount, 0) > 0
     OR c.opening_balance != 0
     OR COALESCE(r.total, 0) > 0
  ORDER BY c.customer_name;
$$;

COMMENT ON FUNCTION public.reconcile_customer_balances(UUID) IS
  'Org customer balances. calculated_balance = get_customer_true_outstanding (ledger-aligned). Display CTEs gate cancelled/hold/deleted invoices on sale_returns + cash_pay to match the invoices CTE.';

GRANT EXECUTE ON FUNCTION public.reconcile_customer_balances(UUID) TO authenticated, service_role;