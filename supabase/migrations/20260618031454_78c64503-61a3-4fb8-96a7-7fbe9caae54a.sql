
-- 1) Reduce 3× function call to 1× call per row in reconcile_customer_balances
CREATE OR REPLACE FUNCTION public.reconcile_customer_balances(p_organization_id uuid)
 RETURNS TABLE(customer_id uuid, customer_name text, phone text, total_invoices numeric, total_cash_payments numeric, total_advances numeric, total_advance_used numeric, total_sale_returns numeric, total_refunds_paid numeric, calculated_balance numeric, advance_available numeric, notes text)
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
  cust AS (
    SELECT cu.id, cu.customer_name, cu.phone, COALESCE(cu.opening_balance, 0) AS opening_balance
    FROM public.customers cu
    WHERE cu.organization_id = p_organization_id
      AND cu.deleted_at IS NULL
  ),
  base AS (
    SELECT
      c.id,
      c.customer_name,
      c.phone,
      COALESCE(i.total, 0) AS total_inv,
      COALESCE(cp.total, 0) + COALESCE(op.total, 0) AS total_cash,
      COALESCE(a.total_amount, 0) AS total_adv,
      COALESCE(a.total_used, 0) AS total_adv_used,
      COALESCE(r.total, 0) AS total_ret,
      COALESCE(arf.total, 0) + COALESCE(rv.total, 0) AS total_ref,
      COALESCE(arf.total, 0) AS adv_refund
    FROM cust c
    LEFT JOIN inv i ON i.customer_id = c.id
    LEFT JOIN cash_pay cp ON cp.customer_id = c.id
    LEFT JOIN open_pay op ON op.cust_id = c.id
    LEFT JOIN adv a ON a.customer_id = c.id
    LEFT JOIN ret r ON r.customer_id = c.id
    LEFT JOIN adv_ref arf ON arf.customer_id = c.id
    LEFT JOIN ref_vouch rv ON rv.cust_id = c.id
    WHERE COALESCE(i.total, 0) > 0
       OR COALESCE(a.total_amount, 0) > 0
       OR c.opening_balance != 0
       OR COALESCE(r.total, 0) > 0
  )
  SELECT
    b.id AS customer_id,
    b.customer_name,
    b.phone,
    b.total_inv AS total_invoices,
    b.total_cash AS total_cash_payments,
    b.total_adv AS total_advances,
    b.total_adv_used AS total_advance_used,
    b.total_ret AS total_sale_returns,
    b.total_ref AS total_refunds_paid,
    calc.bal AS calculated_balance,
    GREATEST(0, b.total_adv - b.total_adv_used - b.adv_refund)::numeric AS advance_available,
    CASE
      WHEN calc.bal > 0.5 THEN 'Dr (Customer owes)'
      WHEN calc.bal < -0.5 THEN 'Cr (Overpaid/Advance)'
      ELSE 'Settled'
    END AS notes
  FROM base b
  CROSS JOIN LATERAL (
    SELECT public.get_customer_true_outstanding(b.id, p_organization_id)::NUMERIC AS bal
  ) calc
  ORDER BY b.customer_name;
$function$;

GRANT EXECUTE ON FUNCTION public.reconcile_customer_balances(uuid) TO authenticated, service_role;

-- 2) Lightweight org-level receivables summary (no per-row plpgsql) for headline cards
CREATE OR REPLACE FUNCTION public.get_organization_receivables_summary(p_organization_id uuid)
 RETURNS TABLE(
   customer_count integer,
   customers_owing integer,
   customers_in_credit integer,
   gross_receivable_dr numeric,
   customer_credit_pool_cr numeric,
   net_receivable numeric,
   advance_available numeric
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH rc AS (
    SELECT calculated_balance, advance_available
    FROM public.reconcile_customer_balances(p_organization_id)
  )
  SELECT
    COUNT(*)::int AS customer_count,
    COUNT(*) FILTER (WHERE calculated_balance > 0.5)::int AS customers_owing,
    COUNT(*) FILTER (WHERE calculated_balance < -0.5)::int AS customers_in_credit,
    ROUND(COALESCE(SUM(GREATEST(calculated_balance, 0)), 0)::numeric, 2) AS gross_receivable_dr,
    ROUND(COALESCE(SUM(GREATEST(-calculated_balance, 0)), 0)::numeric, 2) AS customer_credit_pool_cr,
    ROUND(COALESCE(SUM(calculated_balance), 0)::numeric, 2) AS net_receivable,
    ROUND(COALESCE(SUM(advance_available), 0)::numeric, 2) AS advance_available
  FROM rc;
$function$;

GRANT EXECUTE ON FUNCTION public.get_organization_receivables_summary(uuid) TO authenticated, service_role;

-- 3) Supplier payable summary that nets voucher_entries payments against open bills
CREATE OR REPLACE FUNCTION public.get_organization_supplier_payable_summary(p_organization_id uuid)
 RETURNS TABLE(
   supplier_count integer,
   open_bills numeric,
   paid_via_bill numeric,
   paid_via_vouchers numeric,
   credit_notes numeric,
   net_outstanding numeric
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH bills AS (
    SELECT
      COUNT(DISTINCT supplier_id) FILTER (WHERE COALESCE(net_amount,0) - COALESCE(paid_amount,0) > 0.5) AS supplier_count,
      COALESCE(SUM(net_amount), 0) AS open_bills,
      COALESCE(SUM(paid_amount), 0) AS paid_via_bill
    FROM public.purchase_bills
    WHERE organization_id = p_organization_id
      AND deleted_at IS NULL
      AND COALESCE(is_cancelled, false) = false
  ),
  pays AS (
    SELECT COALESCE(SUM(total_amount + COALESCE(discount_amount,0)), 0) AS paid_via_vouchers
    FROM public.voucher_entries
    WHERE organization_id = p_organization_id
      AND deleted_at IS NULL
      AND voucher_type = 'payment'
      AND lower(COALESCE(reference_type,'')) IN ('supplier','supplierpayment','supplier_payment','purchase')
  ),
  cns AS (
    SELECT COALESCE(SUM(total_amount + COALESCE(discount_amount,0)), 0) AS credit_notes
    FROM public.voucher_entries
    WHERE organization_id = p_organization_id
      AND deleted_at IS NULL
      AND voucher_type = 'credit_note'
      AND lower(COALESCE(reference_type,'')) IN ('supplier','supplierpayment','supplier_payment','purchase')
  )
  SELECT
    COALESCE(b.supplier_count, 0)::int,
    ROUND(b.open_bills::numeric, 2),
    ROUND(b.paid_via_bill::numeric, 2),
    ROUND(p.paid_via_vouchers::numeric, 2),
    ROUND(c.credit_notes::numeric, 2),
    ROUND((b.open_bills - b.paid_via_bill - p.paid_via_vouchers - c.credit_notes)::numeric, 2)
  FROM bills b CROSS JOIN pays p CROSS JOIN cns c;
$function$;

GRANT EXECUTE ON FUNCTION public.get_organization_supplier_payable_summary(uuid) TO authenticated, service_role;
