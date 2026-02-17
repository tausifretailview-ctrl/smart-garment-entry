

## Tiered Search Optimization Plan (Safe Mode)

### What We'll Do

Optimize search performance and reduce cloud bandwidth across the application without changing any business logic, invoice flows, or RLS policies.

### Phase 1: Enable Trigram Extension + Add Missing Indexes

Add the `pg_trgm` extension (not currently installed) and create trigram indexes for fast `ILIKE` searches on ~10K customers and ~10K product variants.

**New indexes to create:**
- `idx_customers_name_trgm` (GIN trigram on `customer_name`)
- `idx_customers_phone_trgm` (GIN trigram on `phone`)
- `idx_customers_email_trgm` (GIN trigram on `email`)
- `idx_products_name_trgm` (GIN trigram on `product_name`)
- `idx_products_brand_trgm` (GIN trigram on `brand`)

**Already existing indexes (no action needed):**
- `idx_product_variants_barcode`
- `idx_product_variants_org_barcode`
- `idx_customers_org_deleted`
- `idx_customers_org_name`
- `idx_products_org_deleted`
- `idx_product_variants_org_deleted`

### Phase 2: POS Prefetch Payload Reduction (Biggest Cloud Savings)

Currently POS fetches `SELECT *, product_variants(*, batch_stock(*))` in 1000-row batches across all products. With 10K+ variants, this transfers massive payloads including unnecessary columns.

**Change:** Replace `SELECT *` with explicit column lists:
- Products: `id, product_name, brand, hsn_code, product_type, status`
- Variants: `id, barcode, size, color, stock_qty, sale_price, mrp, pur_price, product_id`
- Remove `batch_stock` from POS prefetch (only needed at checkout, not search)

**Expected savings:** ~60% reduction in POS prefetch payload size.

### Phase 3: Limit + hasMore Accuracy

Apply the "fetch N+1, show N" pattern for accurate "more results" indicators:
- Customer search: fetch 101, show 100
- Product search in entry screens: fetch 101, show 100

### Phase 4: POS Partial Index for Stock Filtering

Add a composite partial index specifically for POS queries:

```text
idx_variants_pos_active ON product_variants(organization_id, stock_qty)
WHERE deleted_at IS NULL AND active = true
```

### What We Will NOT Change
- No invoice logic modifications
- No RLS policy changes
- No table/column drops
- No business logic changes
- Debounce stays at 300ms
- Soft-delete filtering unchanged
- Organization scoping unchanged
- Search limits stay at current values (100 for customers, varies for products) -- trigram indexes make current limits efficient enough without needing increases

### Files to Modify
- **Migration SQL** -- pg_trgm extension + trigram indexes + POS partial index
- `src/pages/POSSales.tsx` -- Replace `SELECT *` with explicit columns in prefetch query
- `src/hooks/useCustomerSearch.tsx` -- Apply limit+1 pattern for hasMore accuracy
- `src/components/ProductSearchDropdown.tsx` -- Apply limit+1 pattern

### Expected Results
- Customer/product `ILIKE` searches use index scans instead of sequential scans on 10K+ rows
- POS prefetch bandwidth reduced by ~60%
- Accurate "more results" indicator in search dropdowns
- No increase in compute load -- indexes trade disk space for CPU savings
