

## Fix Sales Invoice Dashboard Performance

### Root Cause
The dashboard fetches **ALL invoices** from the database in a loop (1000 rows at a time) with **all sale_items eagerly joined**. For organizations like "ELLA NOOR" with thousands of invoices, this means:
- Massive data transfer (every invoice + every line item)
- Client-side filtering/search instead of server-side
- No staleTime — refetches on every tab focus
- Summary stats computed over the entire dataset in memory

### Changes

**1. Server-side pagination and filtering (`SalesInvoiceDashboard.tsx`)**
- Replace the "fetch all in a loop" pattern with a single paginated query using `.range()` for the current page only
- Move search, date range, and payment status filters to the database query (server-side)
- Use `.select('*', { count: 'exact' })` to get total count without fetching all rows
- **Do NOT join `sale_items (*)`** in the list query — fetch items only when a row is expanded
- Add `staleTime: 30000` and `refetchOnWindowFocus: false`

**2. Lazy-load sale_items on row expand**
- When user expands a row, fetch `sale_items` for that specific invoice ID
- Cache expanded items in state to avoid re-fetching

**3. Server-side summary stats via RPC**
- Create a database function `get_sales_dashboard_stats` that computes totalInvoices, totalAmount, totalDiscount, totalQty, pendingAmount, deliveredCount, etc. using the same filters
- This avoids downloading all rows just for summary cards

**4. Debounce search**
- Add 300ms debounce on `searchQuery` before triggering the server query

### Technical Detail

**Current query (problematic):**
```typescript
// Loops fetching ALL pages of 1000 with sale_items joined
while (hasMore) {
  query = supabase.from('sales').select('*, sale_items (*)')
    .range(offset, offset + 999);
  // ... accumulates everything
}
```

**New query (optimized):**
```typescript
// Single page fetch, no sale_items, server-side filters
let query = supabase.from('sales')
  .select('id, sale_number, sale_date, customer_name, customer_phone, net_amount, paid_amount, payment_status, delivery_status, ...', { count: 'exact' })
  .eq('organization_id', orgId)
  .eq('sale_type', 'invoice')
  .is('deleted_at', null);

// Server-side filters
if (search) query = query.or(`sale_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`);
if (dateStart) query = query.gte('sale_date', dateStart);
if (dateEnd) query = query.lte('sale_date', dateEnd);
if (paymentStatus !== 'all') query = query.eq('payment_status', paymentStatus);
if (deliveryFilter !== 'all') query = query.eq('delivery_status', deliveryFilter);

query = query.order('created_at', { ascending: false })
  .range(startIndex, endIndex);
```

**New RPC for stats:**
```sql
CREATE OR REPLACE FUNCTION get_sales_invoice_dashboard_stats(
  p_org_id uuid, p_search text, p_date_start date, p_date_end date,
  p_payment_status text, p_delivery_status text
) RETURNS json ...
```

### Files to Modify
- `src/pages/SalesInvoiceDashboard.tsx` — main query refactor, lazy item loading, debounced search
- `src/components/SalesInvoiceERPTable.tsx` — accept items separately instead of from `invoice.sale_items`
- Database migration — create `get_sales_invoice_dashboard_stats` RPC

### Impact
- Initial load: ~50 rows with no joins vs thousands of rows with all items
- Search: server-side instead of downloading everything
- Summary cards: single RPC returning 8 numbers vs computing over all rows
- Expected improvement: 10-50x faster for large organizations

