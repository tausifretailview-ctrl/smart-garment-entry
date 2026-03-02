

## Create `get_erp_dashboard_stats` RPC for Faster Dashboard Loading

### Problem
The desktop dashboard currently fires **8-10 separate queries** to different views/tables on every load. Each query is a round-trip to the backend, adding latency -- especially on slow connections (Jio, etc.).

### Solution
Create a single server-side database function `get_erp_dashboard_stats` that returns all dashboard metrics in **one RPC call**, then update the desktop and mobile dashboards to use it.

### What the RPC Will Return (single JSON object)
```text
{
  total_sales, invoice_count, sold_qty,
  total_purchase, purchase_count, purchase_qty,
  customer_count, supplier_count, product_count,
  total_stock_qty, total_stock_value,
  total_receivables, pending_count,
  gross_profit,
  cash_collection,
  sale_return_total, sale_return_count, sale_return_qty,
  purchase_return_total, purchase_return_count, purchase_return_qty
}
```

### Technical Steps

**1. Database Migration -- Create `get_erp_dashboard_stats` function**
- Input parameters: `p_org_id UUID`, `p_start_date DATE`, `p_end_date DATE`
- Aggregates data from the existing views (`v_dashboard_sales_summary`, `v_dashboard_purchase_summary`, `v_dashboard_counts`, `v_dashboard_stock_summary`, `v_dashboard_receivables`, `v_dashboard_gross_profit`) and from `sale_returns`/`purchase_returns` tables
- Returns a single JSON row
- Uses `SECURITY DEFINER` with `search_path = public` for RLS compatibility

**2. Update `src/pages/Index.tsx` (Desktop Dashboard)**
- Replace the 8 separate `useQuery` hooks (`total-sales`, `purchase-total`, `stock-summary`, `dashboard-counts`, `receivables`, `profit-data-cogs`, `sale-returns`, `purchase-returns`, `cash-collection`) with a single `useQuery` that calls `supabase.rpc('get_erp_dashboard_stats', { ... })`
- Extract individual metrics from the returned JSON object
- Keep the same `AnimatedMetricCard` rendering logic
- Keep tier-based refresh and manual refresh support

**3. Update `src/components/mobile/MobileDashboard.tsx`**
- Replace the 4 separate queries (`mobile-today-sales`, `mobile-month-sales`, `mobile-stock-value`, `mobile-receivables`) with a single RPC call using today's date range
- Map returned fields to existing `MobileDashboardCard` props

**4. Update `src/components/mobile/MobileDashboardSummary.tsx`**
- Replace the 2 queries (sales summary + receivables) with the same RPC data (pass down via props or use shared query key)

### Benefits
- **~80% fewer network round-trips** on dashboard load (1 call instead of 8-10)
- Server-side aggregation is faster than client-side row processing
- Reduces cloud egress significantly
- Single point of failure/retry instead of partial load states

### Files to Modify
1. **Database migration** -- new `get_erp_dashboard_stats` function
2. `src/pages/Index.tsx` -- consolidate queries into single RPC
3. `src/components/mobile/MobileDashboard.tsx` -- use RPC
4. `src/components/mobile/MobileDashboardSummary.tsx` -- use shared RPC data

