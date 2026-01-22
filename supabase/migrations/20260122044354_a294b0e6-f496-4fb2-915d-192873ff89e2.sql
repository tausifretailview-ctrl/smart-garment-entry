-- Phase 1: Add Critical Database Indexes for Multi-Tenant Scalability
-- (Corrected - only for columns that exist)

-- Composite indexes for organization-scoped queries
CREATE INDEX IF NOT EXISTS idx_sales_org_date ON sales(organization_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_customers_org_name ON customers(organization_id, customer_name);
CREATE INDEX IF NOT EXISTS idx_products_org_status ON products(organization_id, status) WHERE deleted_at IS NULL;

-- Indexes for report performance (sale_items doesn't have org_id, use sale_id instead)
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sale_items_variant ON sale_items(variant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_items_sku ON purchase_items(sku_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_items_bill ON purchase_items(bill_id) WHERE deleted_at IS NULL;

-- Additional indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_product_variants_org ON product_variants(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_org_name ON suppliers(organization_id, supplier_name);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_org_date ON purchase_bills(organization_id, bill_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON stock_movements(variant_id, created_at DESC);