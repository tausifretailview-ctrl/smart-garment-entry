# Multi-Organization Scaling Optimization Plan

This plan optimizes the application to safely support 50+ organizations on the existing database without breaking production. Changes are additive and non-destructive.

---

Before applying any schema changes, generate a migration preview and confirm no destructive operations are included.

## Phase 1: Database Views for Dashboard Aggregation

Currently, dashboard metrics (total sales, stock value, receivables, profit, etc.) fetch raw rows to the browser and aggregate with JavaScript. With 50+ organizations and growing data, this wastes bandwidth and CPU.

**Create SQL Views** that perform aggregation server-side, filtered by `organization_id`:

- `v_dashboard_sales_summary` -- SUM(net_amount), COUNT(*), grouped by organization_id + date range
- `v_dashboard_stock_summary` -- SUM(stock_qty), SUM(stock_qty * pur_price) from product_variants (excluding deleted)
- `v_dashboard_receivables` -- SUM of outstanding balances from pending/partial sales
- `v_dashboard_counts` -- COUNT of customers, suppliers, products per org

These views will use `WITH (security_invoker=on)` so existing RLS policies apply automatically.

**Frontend changes**: Update `Index.tsx` (DesktopDashboard) queries to call views instead of fetching raw rows. The existing queries remain as fallback comments until views are verified working.

---

## Phase 2: Composite Index Optimization

Several high-traffic tables lack composite indexes. These will be added via safe `CREATE INDEX IF NOT EXISTS CONCURRENTLY`-equivalent migrations:


| Table              | Composite Index                                                 |
| ------------------ | --------------------------------------------------------------- |
| `sales`            | `(organization_id, sale_date, deleted_at)`                      |
| `sales`            | `(organization_id, payment_status, deleted_at)`                 |
| `purchase_bills`   | `(organization_id, bill_date, deleted_at)`                      |
| `product_variants` | `(organization_id, barcode)`                                    |
| `product_variants` | `(organization_id, deleted_at)`                                 |
| `customers`        | `(organization_id, customer_id)` -- already exists in some form |
| `sale_returns`     | `(organization_id, return_date, deleted_at)`                    |
| `purchase_returns` | `(organization_id, return_date, deleted_at)`                    |
| `stock_movements`  | `(organization_id, variant_id)`                                 |
| `employees`        | `(organization_id, status)`                                     |
| `settings`         | `(organization_id)`                                             |


Indexes are additive -- no tables are modified, no columns dropped.

---

## Phase 3: Reduce select('*') on High-Traffic Pages

Replace `select('*')` with explicit column lists on the most-used queries:

- **Settings queries** (used on every page): Only select fields actually used (company_name, address, gst_number, etc.)
- **Sales dashboard** queries: Select only id, net_amount, sale_date, customer_name, payment_status
- **Employee queries**: Select only id, name, status
- **Customer search**: Select only id, customer_name, phone, city

This reduces payload size significantly as tables grow.

---

## Phase 4: Dashboard Query Consolidation

Currently the dashboard fires 12+ separate queries. Consolidate into 2-3 queries using the new views:

1. **Sales + Returns summary** (1 query to `v_dashboard_sales_summary`)
2. **Stock + Inventory** (1 query to `v_dashboard_stock_summary`)
3. **Counts** (1 query to `v_dashboard_counts`)

This reduces database round-trips from ~12 to ~3 per dashboard load.

---

## Phase 5: Verify Organization Filtering

Audit all Supabase queries to confirm `.eq('organization_id', ...)` is present. Based on exploration, the existing codebase consistently applies this filter. This phase is a verification pass with no code changes unless gaps are found.

---

## Safety Guarantees

- No columns, tables, or sequences will be dropped
- No existing RLS policies will be modified (already enabled on all 77 tables)
- Invoice numbering logic remains untouched
- All changes are additive (new views, new indexes)
- Existing frontend query logic stays as commented fallback until new views are verified
- No destructive schema changes

---

## Technical Details

### View: v_dashboard_sales_summary

```sql
CREATE VIEW v_dashboard_sales_summary WITH (security_invoker=on) AS
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
```

### View: v_dashboard_stock_summary

```sql
CREATE VIEW v_dashboard_stock_summary WITH (security_invoker=on) AS
SELECT
  pv.organization_id,
  COALESCE(SUM(pv.stock_qty), 0) as total_stock_qty,
  COALESCE(SUM(pv.stock_qty * pv.pur_price), 0) as total_stock_value
FROM product_variants pv
INNER JOIN products p ON p.id = pv.product_id
WHERE pv.deleted_at IS NULL AND p.deleted_at IS NULL
GROUP BY pv.organization_id;
```

### View: v_dashboard_counts

```sql
CREATE VIEW v_dashboard_counts WITH (security_invoker=on) AS
SELECT
  organization_id,
  (SELECT COUNT(*) FROM customers c WHERE c.organization_id = o.id AND c.deleted_at IS NULL) as customer_count,
  (SELECT COUNT(*) FROM suppliers s WHERE s.organization_id = o.id AND s.deleted_at IS NULL) as supplier_count,
  (SELECT COUNT(*) FROM products p WHERE p.organization_id = o.id AND p.deleted_at IS NULL) as product_count
FROM organizations o;
```

### Frontend Query (Example - Sales)

```typescript
// Before: fetches all rows, sums in JS
const { data } = await supabase.from("sales").select("net_amount, id")...

// After: single aggregated row from view
const { data } = await supabase
  .from("v_dashboard_sales_summary")
  .select("invoice_count, total_sales, total_paid, total_cash")
  .eq("organization_id", currentOrganization.id)
  .gte("sale_day", startDate)
  .lte("sale_day", endDate);
const totals = data?.reduce((acc, row) => ({
  total: acc.total + row.total_sales,
  count: acc.count + row.invoice_count,
}), { total: 0, count: 0 });
```

### Index Migration (Example)

```sql
CREATE INDEX IF NOT EXISTS idx_sales_org_date_deleted
  ON sales (organization_id, sale_date, deleted_at);
```

### Files Modified

- **New migration**: SQL file with views + indexes
- `src/pages/Index.tsx`: Dashboard queries updated to use views
- `src/components/dashboard/StatsChartsSection.tsx`: Charts queries optimized
- `src/components/mobile/MobileDashboardSummary.tsx`: Mobile summary optimized
- Various pages: `select('*')` replaced with explicit columns 