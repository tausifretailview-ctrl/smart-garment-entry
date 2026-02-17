

## Report Optimization Phase (Safe Mode)

### Overview

Optimize 7 high-bandwidth report pages and the shared `fetchAllRows.ts` utility to eliminate full-table fetches, replace `SELECT *` with explicit columns, and add server-side filtering -- without changing any business logic, GST calculations, or RLS policies.

### Priority 1: Product Tracking Report (CRITICAL)

**File:** `src/pages/ProductTrackingReport.tsx`

**Current problem:** Fetches ALL `stock_movements` rows on mount with no date filter or limit. All filtering (barcode, date, type, category, brand) happens client-side. This is the single biggest cloud usage offender.

**Changes:**
- Require a date range before fetching (default: last 30 days, max: 90 days)
- Move all filters to server-side: barcode/product search via `ilike`, movement type via `.eq()`, date range via `.gte()/.lte()`
- Add server-side pagination with LIMIT 100 per page (using `.range()`)
- Remove client-side `applyFilters()` function and client-side pagination logic
- Replace the join-based query with explicit column selection
- Remove running balance calculation (requires full history per variant -- incompatible with server-side pagination; show raw quantity instead)
- Populate category/brand filter dropdowns from a lightweight products query instead of extracting from fetched movements

**New SQL index (migration):**
```sql
CREATE INDEX IF NOT EXISTS idx_stock_movements_org_date
ON stock_movements(organization_id, created_at DESC)
WHERE deleted_at IS NULL;
```

### Priority 2: Item-wise Stock Report

**File:** `src/pages/ItemWiseStockReport.tsx`

**Current problem:** Fetches ALL product variants in 1000-row batches on mount, then aggregates client-side. With 10K+ variants, this is a huge payload.

**Changes:**
- Do NOT auto-fetch on mount. Require at least one filter (brand, category, department, or search query) before fetching
- Show a prompt: "Select a filter or search to view stock data"
- Replace `SELECT *` with explicit columns: `id, stock_qty, pur_price, sale_price` for variants; `id, product_name, product_type, brand, category, style, deleted_at` for products (already done partially)
- Add server-side pagination with LIMIT 200 per page
- Keep client-side aggregation by product name (needed for grouping)

### Priority 3: Item-wise Sales Report

**File:** `src/pages/ItemWiseSalesReport.tsx`

**Current problem:** Fetches all sale IDs for a period, then uses `fetchAllSaleItems()` to fetch ALL sale items, then fetches product details by ID, then aggregates client-side. Three round-trips with unbounded data.

**Changes:**
- Replace multi-step fetch with a single query approach:
  - Fetch sales with date filter (already done) but with explicit columns: `id, customer_name` only
  - For `fetchAllSaleItems`, already uses explicit columns -- no change needed
  - Keep the existing aggregation logic (it's efficient once data arrives)
- Add a row count guard: if sales count exceeds 5000, show a warning to narrow the date range
- The `fetchAllSaleItems` function already uses explicit columns (`variant_id, quantity, line_total, gst_percent, product_id, product_name, sale_id, hsn_code`) -- no change needed there

### Priority 4: Replace SELECT * in fetchAllRows.ts

**File:** `src/utils/fetchAllRows.ts`

**Current problem:** `fetchAllCustomers`, `fetchAllSuppliers`, `fetchAllSalesWithFilters`, `fetchAllPurchaseBillsWithFilters`, `fetchAllVouchersWithFilters`, `fetchAllSalesDetails` all use `SELECT *`.

**Changes:**
- `fetchAllCustomers`: Replace `*` with `id, customer_name, phone, email, gst_number, address, city, state, customer_type, opening_balance, points_balance`
- `fetchAllSuppliers`: Replace `*` with `id, supplier_name, phone, email, gst_number, address, city, state, opening_balance`
- `fetchAllSalesWithFilters`: Replace `*` with `id, sale_date, sale_number, customer_name, customer_id, gross_amount, discount_amount, flat_discount_amount, net_amount, paid_amount, cash_amount, card_amount, upi_amount, payment_method, payment_status, sale_type, refund_amount, sale_return_adjust, points_redeemed_amount, balance_amount`
- `fetchAllPurchaseBillsWithFilters`: Replace `*` with `id, bill_date, supplier_name, supplier_invoice_no, gross_amount, gst_amount, net_amount, supplier_id`
- `fetchAllVouchersWithFilters`: Replace `*` with `id, voucher_number, voucher_date, voucher_type, total_amount, description, party_name, payment_mode`
- `fetchAllSalesDetails`: Replace `*` with same fields as `fetchAllSalesWithFilters`

### Priority 5: Sales Analytics Dashboard

**File:** `src/pages/SalesAnalyticsDashboard.tsx`

**Current problem:** Line 86 uses `SELECT *` on sales table. Already has date filtering but fetches all columns.

**Changes:**
- Replace `.select("*")` with explicit columns: `id, sale_date, sale_number, customer_name, customer_id, gross_amount, discount_amount, flat_discount_amount, net_amount, paid_amount, payment_method, payment_status, sale_type`

### Priority 6: GST Reports

**Files:** `src/pages/GSTReports.tsx`, `src/pages/GSTSalePurchaseRegister.tsx`

These already use `fetchAllSaleItems` with explicit columns. The main optimization is ensuring the sales queries they trigger also use explicit columns (covered by Priority 4's `fetchAllSalesWithFilters` fix).

No additional page-level changes needed beyond what Priority 4 covers.

### Database Migration

One migration with a single index:

```sql
CREATE INDEX IF NOT EXISTS idx_stock_movements_org_date
ON stock_movements(organization_id, created_at DESC)
WHERE deleted_at IS NULL;
```

### What We Will NOT Change

- No invoice creation/edit logic modifications
- No GST calculation changes
- No RLS policy changes
- No table or column drops
- No business logic changes
- Debounce stays at 300ms
- Soft-delete filtering unchanged
- Organization scoping unchanged
- Export (Excel/PDF/Print) logic unchanged -- exports use the already-fetched filtered data

### Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/` | New index on stock_movements |
| `src/pages/ProductTrackingReport.tsx` | Server-side filtering + pagination + date guard |
| `src/pages/ItemWiseStockReport.tsx` | Require filter before fetch + pagination |
| `src/pages/ItemWiseSalesReport.tsx` | Row count guard |
| `src/pages/SalesAnalyticsDashboard.tsx` | Replace SELECT * with explicit columns |
| `src/utils/fetchAllRows.ts` | Replace SELECT * in 6 functions |

### Expected Results

- Product Tracking Report: From unbounded full-table fetch to max 100 rows per page with index scan -- **~95% bandwidth reduction**
- Item-wise Stock Report: No auto-fetch on mount -- **100% reduction on page load**, paginated after filter
- fetchAllRows utilities: Explicit columns across 6 functions -- **~40-60% payload reduction per call**
- Sales Analytics: Explicit columns -- **~30% payload reduction**
- Overall: **70-90% reduction in report-related cloud bandwidth**

