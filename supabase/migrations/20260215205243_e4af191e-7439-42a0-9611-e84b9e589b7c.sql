
-- ============================================================
-- Phase 1: Dashboard Aggregation Views (security_invoker=on)
-- ============================================================

-- Sales summary view: aggregates sales by org + date
CREATE OR REPLACE VIEW v_dashboard_sales_summary WITH (security_invoker=on) AS
SELECT
  organization_id,
  DATE(sale_date) as sale_day,
  COUNT(*) as invoice_count,
  COALESCE(SUM(net_amount), 0) as total_sales,
  COALESCE(SUM(paid_amount), 0) as total_paid,
  COALESCE(SUM(cash_amount), 0) as total_cash
FROM sales
WHERE deleted_at IS NULL
GROUP BY organization_id, DATE(sale_date);

-- Stock summary view: aggregates stock by org
CREATE OR REPLACE VIEW v_dashboard_stock_summary WITH (security_invoker=on) AS
SELECT
  pv.organization_id,
  COALESCE(SUM(pv.stock_qty), 0) as total_stock_qty,
  COALESCE(SUM(pv.stock_qty * pv.pur_price), 0) as total_stock_value
FROM product_variants pv
INNER JOIN products p ON p.id = pv.product_id
WHERE pv.deleted_at IS NULL AND p.deleted_at IS NULL
GROUP BY pv.organization_id;

-- Receivables summary view
CREATE OR REPLACE VIEW v_dashboard_receivables WITH (security_invoker=on) AS
SELECT
  organization_id,
  COUNT(*) as pending_count,
  COALESCE(SUM(GREATEST(COALESCE(net_amount, 0) - COALESCE(paid_amount, 0), 0)), 0) as total_receivables
FROM sales
WHERE deleted_at IS NULL
  AND payment_status IN ('pending', 'partial')
GROUP BY organization_id;

-- Counts view: customers, suppliers, products per org
CREATE OR REPLACE VIEW v_dashboard_counts WITH (security_invoker=on) AS
SELECT
  o.id as organization_id,
  (SELECT COUNT(*) FROM customers c WHERE c.organization_id = o.id AND c.deleted_at IS NULL) as customer_count,
  (SELECT COUNT(*) FROM suppliers s WHERE s.organization_id = o.id AND s.deleted_at IS NULL) as supplier_count,
  (SELECT COUNT(*) FROM products p WHERE p.organization_id = o.id AND p.deleted_at IS NULL) as product_count
FROM organizations o;

-- Sale returns summary view
CREATE OR REPLACE VIEW v_dashboard_sale_returns WITH (security_invoker=on) AS
SELECT
  organization_id,
  DATE(return_date) as return_day,
  COUNT(*) as return_count,
  COALESCE(SUM(net_amount), 0) as total_returns
FROM sale_returns
WHERE deleted_at IS NULL
GROUP BY organization_id, DATE(return_date);

-- Purchase returns summary view
CREATE OR REPLACE VIEW v_dashboard_purchase_returns WITH (security_invoker=on) AS
SELECT
  organization_id,
  DATE(return_date) as return_day,
  COUNT(*) as return_count,
  COALESCE(SUM(net_amount), 0) as total_returns
FROM purchase_returns
WHERE deleted_at IS NULL
GROUP BY organization_id, DATE(return_date);

-- ============================================================
-- Phase 2: Composite Indexes for High-Traffic Tables
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_sales_org_date_deleted
  ON sales (organization_id, sale_date, deleted_at);

CREATE INDEX IF NOT EXISTS idx_sales_org_payment_deleted
  ON sales (organization_id, payment_status, deleted_at);

CREATE INDEX IF NOT EXISTS idx_purchase_bills_org_date_deleted
  ON purchase_bills (organization_id, bill_date, deleted_at);

CREATE INDEX IF NOT EXISTS idx_product_variants_org_barcode
  ON product_variants (organization_id, barcode);

CREATE INDEX IF NOT EXISTS idx_product_variants_org_deleted
  ON product_variants (organization_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_sale_returns_org_date_deleted
  ON sale_returns (organization_id, return_date, deleted_at);

CREATE INDEX IF NOT EXISTS idx_purchase_returns_org_date_deleted
  ON purchase_returns (organization_id, return_date, deleted_at);

CREATE INDEX IF NOT EXISTS idx_stock_movements_org_variant
  ON stock_movements (organization_id, variant_id);

CREATE INDEX IF NOT EXISTS idx_employees_org_status
  ON employees (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_settings_org
  ON settings (organization_id);

CREATE INDEX IF NOT EXISTS idx_customers_org_deleted
  ON customers (organization_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_suppliers_org_deleted
  ON suppliers (organization_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_products_org_deleted
  ON products (organization_id, deleted_at);
