DROP VIEW IF EXISTS v_dashboard_stock_summary;
CREATE VIEW v_dashboard_stock_summary AS
SELECT pv.organization_id,
    COALESCE(sum(pv.current_stock)::bigint, 0::bigint) AS total_stock_qty,
    COALESCE(sum(pv.current_stock * pv.pur_price), 0::numeric) AS total_stock_value
   FROM product_variants pv
     JOIN products p ON p.id = pv.product_id
  WHERE pv.deleted_at IS NULL AND p.deleted_at IS NULL
  GROUP BY pv.organization_id;