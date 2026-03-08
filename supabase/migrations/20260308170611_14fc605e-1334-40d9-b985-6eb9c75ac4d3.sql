
-- 1. Stock value aggregate (replaces client-side reduce on product_variants)
CREATE OR REPLACE FUNCTION public.get_stock_value(p_org_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM((stock_qty * pur_price)), 0)
  FROM product_variants
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL;
$$;

-- 2. Trial balance / balance sheet aggregates
-- Returns sales/purchase sums with per-customer and per-supplier breakdowns
CREATE OR REPLACE FUNCTION public.get_trial_balance_aggregates(
  p_org_id UUID,
  p_as_of_date DATE
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
      AND invoice_date <= p_as_of_date
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
      AND invoice_date <= p_as_of_date
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
$$;

-- 3. P&L period aggregates
CREATE OR REPLACE FUNCTION public.get_pnl_aggregates(
  p_org_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'gross_sales', COALESCE((
      SELECT SUM(COALESCE(gross_amount, net_amount))
      FROM sales
      WHERE organization_id = p_org_id
        AND sale_date >= p_from_date AND sale_date <= p_to_date
        AND deleted_at IS NULL
    ), 0),
    'sales_returns', COALESCE((
      SELECT SUM(COALESCE(gross_amount, net_amount))
      FROM sale_returns
      WHERE organization_id = p_org_id
        AND return_date >= p_from_date AND return_date <= p_to_date
        AND deleted_at IS NULL
    ), 0),
    'purchases_gross', COALESCE((
      SELECT SUM(COALESCE(gross_amount, 0))
      FROM purchase_bills
      WHERE organization_id = p_org_id
        AND bill_date >= p_from_date AND bill_date <= p_to_date
        AND deleted_at IS NULL
    ), 0),
    'purchases_gst', COALESCE((
      SELECT SUM(COALESCE(gst_amount, 0))
      FROM purchase_bills
      WHERE organization_id = p_org_id
        AND bill_date >= p_from_date AND bill_date <= p_to_date
        AND deleted_at IS NULL
    ), 0),
    'purchase_returns', COALESCE((
      SELECT SUM(COALESCE(gross_amount, net_amount))
      FROM purchase_returns
      WHERE organization_id = p_org_id
        AND return_date >= p_from_date AND return_date <= p_to_date
        AND deleted_at IS NULL
    ), 0),
    'total_expenses', COALESCE((
      SELECT SUM(total_amount)
      FROM voucher_entries
      WHERE organization_id = p_org_id
        AND voucher_type = 'expense'
        AND voucher_date >= p_from_date AND voucher_date <= p_to_date
        AND deleted_at IS NULL
    ), 0),
    'input_gst', COALESCE((
      SELECT SUM(COALESCE(gst_amount, 0))
      FROM purchase_bills
      WHERE organization_id = p_org_id
        AND bill_date >= p_from_date AND bill_date <= p_to_date
        AND deleted_at IS NULL
    ), 0)
  ) INTO result;
  
  RETURN result;
END;
$$;

-- 4. Expense summary by category
CREATE OR REPLACE FUNCTION public.get_expense_by_category(
  p_org_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
  FROM (
    SELECT
      COALESCE(category, 'Miscellaneous') AS category,
      SUM(total_amount) AS amount
    FROM voucher_entries
    WHERE organization_id = p_org_id
      AND voucher_type = 'expense'
      AND voucher_date >= p_from_date
      AND voucher_date <= p_to_date
      AND deleted_at IS NULL
    GROUP BY COALESCE(category, 'Miscellaneous')
    ORDER BY SUM(total_amount) DESC
  ) t;
$$;

-- 5. Net profit summary aggregates (sales totals for a period + sale IDs for COGS)
CREATE OR REPLACE FUNCTION public.get_net_profit_aggregates(
  p_org_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_sales', COALESCE((
      SELECT SUM(net_amount)
      FROM sales
      WHERE organization_id = p_org_id
        AND sale_date >= p_from_date AND sale_date <= p_to_date
        AND deleted_at IS NULL
    ), 0),
    'sales_returns', COALESCE((
      SELECT SUM(net_amount)
      FROM sale_returns
      WHERE organization_id = p_org_id
        AND return_date >= p_from_date AND return_date <= p_to_date
        AND deleted_at IS NULL
    ), 0),
    'input_gst', COALESCE((
      SELECT SUM(COALESCE(gst_amount, 0))
      FROM purchase_bills
      WHERE organization_id = p_org_id
        AND bill_date >= p_from_date AND bill_date <= p_to_date
        AND deleted_at IS NULL
    ), 0),
    'total_expenses', COALESCE((
      SELECT SUM(total_amount)
      FROM voucher_entries
      WHERE organization_id = p_org_id
        AND voucher_type = 'expense'
        AND voucher_date >= p_from_date AND voucher_date <= p_to_date
        AND deleted_at IS NULL
    ), 0)
  ) INTO result;
  
  RETURN result;
END;
$$;
