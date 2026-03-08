

## Plan: Wire Summary RPCs into Frontend

### Discovery

After inspecting all 4 files, **only 2 need changes**:

- **SalesInvoiceDashboard.tsx** — Already wired to `get_sales_invoice_dashboard_stats` RPC (line 429). No change needed.
- **Accounts.tsx** — Already wired to `get_accounts_dashboard_stats` RPC (line 94). No change needed.
- **PurchaseBillDashboard.tsx** — Uses client-side `.reduce()` at line 773. **Needs change.**
- **QuotationDashboard.tsx** — Uses client-side `.length`/`.reduce()` at line 242. **Needs change.**

### Changes

**File 1: `src/pages/PurchaseBillDashboard.tsx`**
- Add a `useQuery` calling `supabase.rpc('get_purchase_summary', { p_org_id, p_start_date, p_end_date })` with the existing date filter state
- Replace the `summaryStats` useMemo (lines 773-783) with a simple fallback object reading from the RPC data
- Map: `total_count` → `totalBills`, `total_amount` → `totalAmount`, `paid_amount` → `paidAmount`, `unpaid_amount` → `unpaidAmount`, `partial_amount` → `partialAmount`
- Keep `totalQty` from the existing local calculation (RPC doesn't return qty)
- Keep `totalCount` from `billsQueryData` for pagination

**File 2: `src/pages/QuotationDashboard.tsx`**
- Add a `useQuery` calling `supabase.rpc('get_quotation_summary', { p_org_id })` 
- Replace the `stats` object (lines 240-252) with RPC data
- Map: `total_count` → `total`, `total_amount` → `totalValue`, `draft_count` → `draft`, `sent_count` → `sent`, `accepted_count` → `confirmed`
- Note: RPC returns `accepted_count` but UI uses "confirmed" — will map accordingly
- `expired` and `conversionRate` are not in the RPC; keep client-side fallback for those or set to 0

### No changes to
- Table queries, pagination, filters, sort state, component interfaces
- SalesInvoiceDashboard.tsx or Accounts.tsx (already using RPCs)

