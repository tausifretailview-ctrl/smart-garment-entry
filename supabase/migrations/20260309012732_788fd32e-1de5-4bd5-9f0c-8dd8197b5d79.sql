CREATE OR REPLACE FUNCTION public.get_trial_balance_aggregates(p_org_id uuid, p_as_of_date date)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  WITH sales_agg AS (
    SELECT
      customer_id,
      COALESCE(SUM(net_amount), 0) AS total_net,
      COALESCE(SUM(paid_amount), 0) AS total_paid
    FROM sales
    WHERE organization_id = p_org_id
      AND sale_date <= p_as_of_date
      AND deleted_at IS NULL
    GROUP BY customer_id
  ),
  purchase_agg AS (
    SELECT
      supplier_id,
      COALESCE(SUM(net_amount), 0) AS total_net,
      COALESCE(SUM(paid_amount), 0) AS total_paid
    FROM purchase_bills
    WHERE organization_id = p_org_id
      AND bill_date <= p_as_of_date
      AND deleted_at IS NULL
    GROUP BY supplier_id
  ),
  customer_balances AS (
    SELECT COALESCE(SUM(
      COALESCE(c.opening_balance, 0) + COALESCE(s.total_net, 0) - COALESCE(s.total_paid, 0)
    ), 0) AS total_debtors
    FROM customers c
    LEFT JOIN sales_agg s ON s.customer_id = c.id
    WHERE c.organization_id = p_org_id
      AND c.deleted_at IS NULL
  ),
  supplier_balances AS (
    SELECT COALESCE(SUM(
      COALESCE(sup.opening_balance, 0) + COALESCE(p.total_net, 0) - COALESCE(p.total_paid, 0)
    ), 0) AS total_creditors
    FROM suppliers sup
    LEFT JOIN purchase_agg p ON p.supplier_id = sup.id
    WHERE sup.organization_id = p_org_id
      AND sup.deleted_at IS NULL
  ),
  sale_returns_agg AS (
    SELECT COALESCE(SUM(net_amount), 0) AS total
    FROM sale_returns
    WHERE organization_id = p_org_id
      AND return_date <= p_as_of_date
      AND deleted_at IS NULL
  ),
  purchase_returns_agg AS (
    SELECT COALESCE(SUM(net_amount), 0) AS total
    FROM purchase_returns
    WHERE organization_id = p_org_id
      AND return_date <= p_as_of_date
      AND deleted_at IS NULL
  ),
  sales_totals AS (
    SELECT
      COALESCE(SUM(net_amount), 0) AS total_sales,
      COALESCE(SUM(paid_amount), 0) AS total_sales_paid
    FROM sales
    WHERE organization_id = p_org_id
      AND sale_date <= p_as_of_date
      AND deleted_at IS NULL
  ),
  purchase_totals AS (
    SELECT
      COALESCE(SUM(net_amount), 0) AS total_purchases,
      COALESCE(SUM(paid_amount), 0) AS total_purchases_paid
    FROM purchase_bills
    WHERE organization_id = p_org_id
      AND bill_date <= p_as_of_date
      AND deleted_at IS NULL
  )
  SELECT json_build_object(
    'total_debtors', (SELECT total_debtors FROM customer_balances),
    'total_creditors', (SELECT total_creditors FROM supplier_balances),
    'total_sales', (SELECT total_sales FROM sales_totals),
    'total_sales_paid', (SELECT total_sales_paid FROM sales_totals),
    'total_purchases', (SELECT total_purchases FROM purchase_totals),
    'total_purchases_paid', (SELECT total_purchases_paid FROM purchase_totals),
    'total_sale_returns', (SELECT total FROM sale_returns_agg),
    'total_purchase_returns', (SELECT total FROM purchase_returns_agg),
    'cash_balance', (SELECT total_sales_paid FROM sales_totals) - (SELECT total_purchases_paid FROM purchase_totals),
    'accounts_receivable', (SELECT total_debtors FROM customer_balances),
    'accounts_payable', (SELECT total_creditors FROM supplier_balances)
  ) INTO result;

  RETURN result;
END;
$function$;