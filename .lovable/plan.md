
# Advanced Database-Level Aggregation Views

Three new SQL views will be created to move heavy aggregation from the browser to the database, followed by frontend refactoring to consume them. All changes are additive and production-safe.

---

## 1. Gross Profit View

**View name:** `v_dashboard_gross_profit`

The user's request references a `cost_price` column on `sale_items`, but this column does not exist. The actual cost data lives in `product_variants.pur_price`. The view will join `sales -> sale_items -> product_variants` to compute COGS server-side.

This replaces the heaviest dashboard query (currently 3 cascading fetches across sales, sale_items, and product_variants with client-side loops).

```sql
CREATE OR REPLACE VIEW v_dashboard_gross_profit WITH (security_invoker=on) AS
SELECT
  s.organization_id,
  DATE(s.sale_date) AS sale_day,
  COALESCE(SUM(si.quantity * si.unit_price), 0) AS total_sale_amount,
  COALESCE(SUM(si.quantity * pv.pur_price), 0) AS total_cost_amount,
  COALESCE(SUM(si.quantity * si.unit_price), 0) - COALESCE(SUM(si.quantity * pv.pur_price), 0) AS gross_profit,
  CASE
    WHEN SUM(si.quantity * si.unit_price) = 0 THEN 0
    ELSE ((SUM(si.quantity * si.unit_price) - SUM(si.quantity * pv.pur_price))
          / SUM(si.quantity * si.unit_price)) * 100
  END AS gross_margin_percent
FROM sales s
JOIN sale_items si ON si.sale_id = s.id AND si.deleted_at IS NULL
LEFT JOIN product_variants pv ON pv.id = si.variant_id
WHERE s.deleted_at IS NULL
GROUP BY s.organization_id, DATE(s.sale_date);
```

**Frontend change in `Index.tsx`:** Replace the 30-line `profit-data-cogs` query (lines 483-531) with a single view query summing `gross_profit` for the date range.

---

## 2. Purchase Summary View

**View name:** `v_dashboard_purchase_summary`

Corrected from the user's request to match actual schema (`bill_date`, `bill_id`, `qty`, `net_amount`).

```sql
CREATE OR REPLACE VIEW v_dashboard_purchase_summary WITH (security_invoker=on) AS
SELECT
  p.organization_id,
  DATE(p.bill_date) AS purchase_day,
  COUNT(DISTINCT p.id) AS bill_count,
  COALESCE(SUM(DISTINCT p.net_amount), 0) AS total_purchase_amount,
  COALESCE(SUM(DISTINCT p.paid_amount), 0) AS total_paid_amount,
  COALESCE(SUM(DISTINCT p.net_amount) - SUM(DISTINCT p.paid_amount), 0) AS total_pending_amount,
  COALESCE(SUM(pi.qty), 0) AS total_items_purchased
FROM purchase_bills p
LEFT JOIN purchase_items pi ON pi.bill_id = p.id AND pi.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.organization_id, DATE(p.bill_date);
```

**Frontend change in `Index.tsx`:** Replace the `purchase-total` query (lines 370-402) -- eliminates the cascading fetch for bill IDs then purchase items.

---

## 3. Enhanced Sales Summary View (Add sold_qty)

Recreate the existing `v_dashboard_sales_summary` with an additional `sold_qty` column by joining `sale_items`.

```sql
CREATE OR REPLACE VIEW v_dashboard_sales_summary WITH (security_invoker=on) AS
SELECT
  s.organization_id,
  DATE(s.sale_date) AS sale_day,
  COUNT(DISTINCT s.id) AS invoice_count,
  COALESCE(SUM(DISTINCT s.net_amount), 0) AS total_sales,
  COALESCE(SUM(DISTINCT s.paid_amount), 0) AS total_paid,
  COALESCE(SUM(DISTINCT s.cash_amount), 0) AS total_cash,
  COALESCE(SUM(si.quantity), 0) AS sold_qty
FROM sales s
LEFT JOIN sale_items si ON si.sale_id = s.id AND si.deleted_at IS NULL
WHERE s.deleted_at IS NULL
GROUP BY s.organization_id, DATE(s.sale_date);
```

**Frontend change in `Index.tsx`:** Remove the cascading sale IDs + fetchAllSaleItems call from the `total-sales` query (lines 306-319). Just read `sold_qty` from the view.

---

## 4. Frontend Refactoring

### Index.tsx -- `total-sales` query (lines 288-325)
- Add `sold_qty` to the select list
- Remove the secondary fetch for sale IDs and `fetchAllSaleItems`
- Sum `sold_qty` from the view rows

### Index.tsx -- `purchase-total` query (lines 370-402)
- Replace with single query to `v_dashboard_purchase_summary`
- Remove cascading bill ID + purchase_items fetch

### Index.tsx -- `profit-data-cogs` query (lines 483-531)
- Replace with single query to `v_dashboard_gross_profit`
- Sum `gross_profit` for the date range
- Eliminates 3 cascading fetches (sales, sale_items, product_variants)

### useDashboardInvalidation.tsx
- Add invalidation for new query keys if any change

### StatsChartsSection.tsx
- Update purchase trend query to use the new purchase summary view

---

## Safety Guarantees

- No tables modified or dropped
- No columns added or removed
- Invoice numbering untouched
- Existing frontend logic replaced only after view correctness is verified in the same query function
- All views use `security_invoker=on` (RLS applies automatically)
- All views filter by `organization_id` in GROUP BY
- `SUM(DISTINCT ...)` used where joins could cause row multiplication

---

## Files Changed

| File | Change |
|------|--------|
| New migration SQL | 3 views created/updated |
| `src/pages/Index.tsx` | 3 queries simplified (profit, purchase, sales) |
| `src/hooks/useDashboardInvalidation.tsx` | Minor key updates |
| `src/components/dashboard/StatsChartsSection.tsx` | Purchase chart query optimization |

## Net Impact

| Metric | Before | After |
|--------|--------|-------|
| Dashboard DB round-trips | ~15 | ~6 |
| Profit calculation | 3 cascading fetches | 1 view query |
| Purchase totals | 2 cascading fetches | 1 view query |
| Sales sold_qty | 2 cascading fetches | Included in existing view |
| Client-side JS loops | Heavy (variants map, reduce) | Minimal (sum view rows) |
