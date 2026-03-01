
# Server-Side Stored Procedures for Report Aggregations

## Overview
Create database RPCs (stored procedures) to move heavy aggregation logic from the browser to the database. Instead of downloading thousands of rows to calculate totals, the database returns a single summary row -- reducing cloud egress by 95%+ for summary cards.

## Approach
We will create RPCs for the three heaviest report aggregations, then update the frontend to call them via `supabase.rpc()`. The detailed table data still uses paginated row fetches (needed for display), but summary cards and chart data now come from tiny RPC responses.

---

## Step 1: Create Database RPCs (Migration)

### RPC 1: `get_sales_report_summary`
Replaces client-side totals calculation in `SalesReportByCustomer.tsx` (currently downloads ALL rows just to sum them).

```sql
CREATE OR REPLACE FUNCTION get_sales_report_summary(
  p_organization_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT json_build_object(
    'sale_count', COUNT(*)::int,
    'gross_amount', COALESCE(SUM(gross_amount), 0),
    'discount_amount', COALESCE(SUM(discount_amount), 0),
    'net_amount', COALESCE(SUM(net_amount), 0),
    'top_customers', (
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT COALESCE(customer_name, 'Walk in Customer') as name,
               SUM(net_amount) as amount, COUNT(*)::int as count
        FROM sales
        WHERE organization_id = p_organization_id
          AND deleted_at IS NULL
          AND (p_start_date IS NULL OR sale_date >= p_start_date)
          AND (p_end_date IS NULL OR sale_date <= p_end_date)
          AND (p_customer_id IS NULL OR customer_id = p_customer_id)
        GROUP BY customer_name
        ORDER BY SUM(net_amount) DESC LIMIT 10
      ) t
    ),
    'payment_methods', (
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT COALESCE(payment_method, 'Unknown') as name,
               SUM(net_amount) as value
        FROM sales
        WHERE organization_id = p_organization_id
          AND deleted_at IS NULL
          AND (p_start_date IS NULL OR sale_date >= p_start_date)
          AND (p_end_date IS NULL OR sale_date <= p_end_date)
          AND (p_customer_id IS NULL OR customer_id = p_customer_id)
        GROUP BY payment_method
      ) t
    )
  )
  FROM sales
  WHERE organization_id = p_organization_id
    AND deleted_at IS NULL
    AND (p_start_date IS NULL OR sale_date >= p_start_date)
    AND (p_end_date IS NULL OR sale_date <= p_end_date)
    AND (p_customer_id IS NULL OR customer_id = p_customer_id);
$$;
```

### RPC 2: `get_stock_report_totals`
Replaces the heavy global totals fetch in `StockReport.tsx` (currently downloads ALL variant rows with nested product joins to calculate 4 numbers).

```sql
CREATE OR REPLACE FUNCTION get_stock_report_totals(p_organization_id UUID)
RETURNS JSON
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT json_build_object(
    'total_stock', COALESCE(SUM(pv.stock_qty), 0)::int,
    'stock_value', COALESCE(SUM(COALESCE(pv.pur_price, 0) * pv.stock_qty), 0),
    'sale_value', COALESCE(SUM(pv.sale_price * pv.stock_qty), 0),
    'variant_count', COUNT(*)::int
  )
  FROM product_variants pv
  INNER JOIN products p ON p.id = pv.product_id
  WHERE pv.organization_id = p_organization_id
    AND pv.active = true
    AND pv.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND p.product_type != 'service';
$$;
```

### RPC 3: `get_item_sales_summary`
Replaces client-side summary calculation in `ItemWiseSalesReport.tsx`.

```sql
CREATE OR REPLACE FUNCTION get_item_sales_summary(
  p_organization_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_customer_name TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT json_build_object(
    'total_qty', COALESCE(SUM(si.quantity), 0)::int,
    'total_amount', COALESCE(SUM(si.line_total), 0),
    'unique_products', COUNT(DISTINCT si.product_name)::int,
    'avg_price', CASE WHEN SUM(si.quantity) > 0
                      THEN SUM(si.line_total) / SUM(si.quantity)
                      ELSE 0 END
  )
  FROM sale_items si
  INNER JOIN sales s ON s.id = si.sale_id
  WHERE s.organization_id = p_organization_id
    AND s.deleted_at IS NULL
    AND si.deleted_at IS NULL
    AND s.sale_date >= p_start_date
    AND s.sale_date <= p_end_date
    AND (p_customer_name IS NULL OR s.customer_name = p_customer_name);
$$;
```

---

## Step 2: Update Frontend Components

### SalesReportByCustomer.tsx
- Add a new `useQuery` calling `supabase.rpc('get_sales_report_summary', {...})` for summary cards and chart data
- Keep the existing paginated row fetch ONLY for the table display
- Summary cards, bar chart (top customers), and pie chart (payment methods) all powered by the single RPC response
- This eliminates downloading thousands of rows just to show 4 numbers + 2 charts

### StockReport.tsx
- Replace the heavy `stock-report-global-totals` query (which downloads ALL variants with nested joins) with `supabase.rpc('get_stock_report_totals', {...})`
- Response: one row with 4 numbers instead of potentially 10,000+ variant rows

### ItemWiseSalesReport.tsx
- Add a `useQuery` calling `supabase.rpc('get_item_sales_summary', {...})` for the 4 summary cards
- Keep existing item-level fetch for the table (already paginated)

### PurchaseReportBySupplier.tsx
- Also lacks caching -- add `REPORT_CACHE` options to both queries (bonus fix)

---

## Impact Estimate

| Report | Current Egress | After RPC | Reduction |
|--------|---------------|-----------|-----------|
| Sales Report summary | ~50KB-500KB (all rows) | ~200 bytes (1 JSON) | ~99% |
| Stock Report totals | ~100KB-1MB (all variants) | ~100 bytes (1 JSON) | ~99% |
| Item Sales summary | ~50KB-300KB (all items) | ~100 bytes (1 JSON) | ~99% |

Table data still fetches rows but only 100 at a time (already paginated).

---

## Files Modified
1. **Database migration** -- 3 new RPCs
2. `src/pages/SalesReportByCustomer.tsx` -- Use RPC for summary + charts
3. `src/pages/StockReport.tsx` -- Use RPC for global totals
4. `src/pages/ItemWiseSalesReport.tsx` -- Use RPC for summary cards
5. `src/pages/PurchaseReportBySupplier.tsx` -- Add caching options

## Security
All RPCs use `SECURITY DEFINER` with `search_path = 'public'` (matching existing project pattern). The `organization_id` parameter ensures tenant isolation. Existing RLS on the underlying tables still applies for row-level fetches.
