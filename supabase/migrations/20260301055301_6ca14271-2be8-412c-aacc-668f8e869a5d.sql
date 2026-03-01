
-- RPC 1: Sales report summary (replaces client-side totals + chart aggregation)
CREATE OR REPLACE FUNCTION get_sales_report_summary(
  p_organization_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT json_build_object(
    'sale_count', COUNT(*)::int,
    'gross_amount', COALESCE(SUM(gross_amount), 0),
    'discount_amount', COALESCE(SUM(discount_amount), 0),
    'net_amount', COALESCE(SUM(net_amount), 0),
    'top_customers', (
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT COALESCE(customer_name, 'Walk in Customer') as name,
               SUM(net_amount) as amount, COUNT(*)::int as count
        FROM sales
        WHERE organization_id = p_organization_id
          AND deleted_at IS NULL
          AND (p_start_date IS NULL OR sale_date >= p_start_date)
          AND (p_end_date IS NULL OR sale_date <= p_end_date)
          AND (p_customer_id IS NULL OR customer_id = p_customer_id)
        GROUP BY customer_name
        ORDER BY SUM(net_amount) DESC LIMIT 10
      ) t
    ),
    'payment_methods', (
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT COALESCE(payment_method, 'Unknown') as name,
               SUM(net_amount) as value
        FROM sales
        WHERE organization_id = p_organization_id
          AND deleted_at IS NULL
          AND (p_start_date IS NULL OR sale_date >= p_start_date)
          AND (p_end_date IS NULL OR sale_date <= p_end_date)
          AND (p_customer_id IS NULL OR customer_id = p_customer_id)
        GROUP BY payment_method
      ) t
    )
  )
  FROM sales
  WHERE organization_id = p_organization_id
    AND deleted_at IS NULL
    AND (p_start_date IS NULL OR sale_date >= p_start_date)
    AND (p_end_date IS NULL OR sale_date <= p_end_date)
    AND (p_customer_id IS NULL OR customer_id = p_customer_id);
$$;

-- RPC 2: Stock report totals (replaces downloading all variants)
CREATE OR REPLACE FUNCTION get_stock_report_totals(p_organization_id UUID)
RETURNS JSON
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT json_build_object(
    'total_stock', COALESCE(SUM(pv.stock_qty), 0)::int,
    'stock_value', COALESCE(SUM(COALESCE(pv.pur_price, 0) * pv.stock_qty), 0),
    'sale_value', COALESCE(SUM(pv.sale_price * pv.stock_qty), 0),
    'variant_count', COUNT(*)::int
  )
  FROM product_variants pv
  INNER JOIN products p ON p.id = pv.product_id
  WHERE pv.organization_id = p_organization_id
    AND pv.active = true
    AND pv.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND p.product_type != 'service';
$$;

-- RPC 3: Item sales summary (replaces client-side summary cards)
CREATE OR REPLACE FUNCTION get_item_sales_summary(
  p_organization_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_customer_name TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT json_build_object(
    'total_qty', COALESCE(SUM(si.quantity), 0)::int,
    'total_amount', COALESCE(SUM(si.line_total), 0),
    'unique_products', COUNT(DISTINCT si.product_name)::int,
    'avg_price', CASE WHEN SUM(si.quantity) > 0
                      THEN SUM(si.line_total) / SUM(si.quantity)
                      ELSE 0 END
  )
  FROM sale_items si
  INNER JOIN sales s ON s.id = si.sale_id
  WHERE s.organization_id = p_organization_id
    AND s.deleted_at IS NULL
    AND si.deleted_at IS NULL
    AND s.sale_date >= p_start_date
    AND s.sale_date <= p_end_date
    AND (p_customer_name IS NULL OR s.customer_name = p_customer_name);
$$;
