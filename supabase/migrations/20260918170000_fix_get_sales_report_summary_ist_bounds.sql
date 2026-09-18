-- Sales Report by Customer: DATE vs timestamptz compared at UTC midnight and dropped
-- same-day POS bills (sale_date stored with +05:30). Use inclusive IST calendar bounds.

CREATE OR REPLACE FUNCTION public.get_sales_report_summary(
  p_organization_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  WITH bounds AS (
    SELECT
      CASE
        WHEN p_start_date IS NULL THEN NULL
        ELSE (p_start_date::text || ' 00:00:00')::timestamp AT TIME ZONE 'Asia/Kolkata'
      END AS start_ts,
      CASE
        WHEN p_end_date IS NULL THEN NULL
        ELSE (p_end_date::text || ' 23:59:59.999')::timestamp AT TIME ZONE 'Asia/Kolkata'
      END AS end_ts
  ),
  filtered AS (
    SELECT s.*
    FROM public.sales s
    CROSS JOIN bounds b
    WHERE s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND (b.start_ts IS NULL OR s.sale_date >= b.start_ts)
      AND (b.end_ts IS NULL OR s.sale_date <= b.end_ts)
      AND (p_customer_id IS NULL OR s.customer_id = p_customer_id)
  )
  SELECT json_build_object(
    'sale_count', (SELECT COUNT(*)::int FROM filtered),
    'gross_amount', COALESCE((SELECT SUM(gross_amount) FROM filtered), 0),
    'discount_amount', COALESCE((SELECT SUM(discount_amount) FROM filtered), 0),
    'net_amount', COALESCE((SELECT SUM(net_amount) FROM filtered), 0),
    'top_customers', (
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT COALESCE(customer_name, 'Walk in Customer') AS name,
               SUM(net_amount) AS amount,
               COUNT(*)::int AS count
        FROM filtered
        GROUP BY customer_name
        ORDER BY SUM(net_amount) DESC
        LIMIT 10
      ) t
    ),
    'payment_methods', (
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT COALESCE(payment_method, 'Unknown') AS name,
               SUM(net_amount) AS value
        FROM filtered
        GROUP BY payment_method
      ) t
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_sales_report_summary(uuid, date, date, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_sales_report_summary(uuid, date, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_sales_report_summary(uuid, date, date, uuid) TO authenticated, service_role;
