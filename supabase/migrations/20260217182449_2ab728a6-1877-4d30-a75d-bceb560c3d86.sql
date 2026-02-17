
-- Phase 1: Enable pg_trgm extension for fast ILIKE searches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram indexes for customer search (currently sequential scans on ~10K rows)
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON customers USING gin (customer_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_phone_trgm ON customers USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_email_trgm ON customers USING gin (email gin_trgm_ops);

-- Trigram indexes for product search
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (product_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_brand_trgm ON products USING gin (brand gin_trgm_ops);

-- Phase 4: POS partial index for fast stock-filtered queries
CREATE INDEX IF NOT EXISTS idx_variants_pos_active 
ON product_variants (organization_id, stock_qty) 
WHERE deleted_at IS NULL AND active = true;
