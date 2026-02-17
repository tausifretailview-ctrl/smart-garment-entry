CREATE INDEX IF NOT EXISTS idx_stock_movements_org_date
ON stock_movements(organization_id, created_at DESC);