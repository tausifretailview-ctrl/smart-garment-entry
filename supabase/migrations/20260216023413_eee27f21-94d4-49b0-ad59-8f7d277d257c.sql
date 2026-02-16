-- 1. SALES TABLE INDEXES
CREATE INDEX IF NOT EXISTS idx_sales_org_date
ON sales (organization_id, sale_date);

CREATE INDEX IF NOT EXISTS idx_sales_org_id
ON sales (organization_id, id);

-- 2. SALE_ITEMS TABLE INDEXES (no organization_id column - index on join key only)
CREATE INDEX IF NOT EXISTS idx_sale_items_saleid
ON sale_items (sale_id);

-- 3. PURCHASE_BILLS TABLE INDEXES
CREATE INDEX IF NOT EXISTS idx_purchase_org_date
ON purchase_bills (organization_id, bill_date);

CREATE INDEX IF NOT EXISTS idx_purchase_org_id
ON purchase_bills (organization_id, id);

-- 4. PURCHASE_ITEMS TABLE INDEXES (no organization_id column - index on join key only)
CREATE INDEX IF NOT EXISTS idx_purchase_items_billid
ON purchase_items (bill_id);