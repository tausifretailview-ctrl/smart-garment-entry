# Fix slow customer search on Sales Invoice Dashboard (All Time)

## What I found (measured on Ella Noor)

Searching a customer name with the **All Time** filter is slow because the dashboard does far more work than the search needs:

1. **The line-item search runs even for customer-name searches.** Any text of 4+ letters (e.g. "ANUSHA PATHAN") triggers `search_invoice_sale_ids`, which scans every invoice of the organization, joins all its sale lines and their products, and filters them one by one. With no date bounds it touched ~4,150 sales / ~5,500 lines and took ~200 ms server-side for Ella Noor, and it scales linearly with org size (bigger orgs are much worse). It returned **zero** rows — pure waste for a customer search.
2. **That same expensive call is repeated many times per search.** It fires once for the KPI count, once for the stats aggregation, and again for every 1,000-row page of the stats loop, plus once for the row page — so one search can trigger 4+ full scans.
3. The header search itself (sale number / customer / phone / salesman) is fast (~56 ms) — it correctly uses the trigram indexes. So the delay is almost entirely the line-item path.

## Fix

### 1. Do not run the line-item search when the header search already answers it
Run the fast header (sales) match first. Only fall back to / union the line-item search when the header match returns no rows, or when the term looks like a product/barcode term (digits, or short SKU-ish tokens). A full customer name that already matches invoices will never pay the line-item cost.

### 2. Compute the matching line-item sale ids once per search
Resolve the id list a single time for a given filter set and reuse it for the count, the stats pages and the row page, instead of re-running the RPC inside every query and every pagination loop.

### 3. Make `search_invoice_sale_ids` index-driven
Rewrite the function so each text column is matched through its existing trigram GIN index and the results are unioned, instead of one OR filter across a sales x sale_items x products join:
- match `sale_items` on `product_name` / `barcode` / `size` / `color` (each already has a `gin_trgm_ops` index) with a per-branch cap, then join to the org's sales;
- match `products` (org-scoped) first to get product ids, then find sale lines by `product_id`;
- keep the existing `assert_org_member` check, org/date/deleted filters and `LIMIT`.

### 4. Guard All Time
When no date range is set, cap the line-item id lookup (bounded row cap per branch) so an unbounded org-wide scan can never happen; header search stays unbounded so customer results are complete.

## Technical notes
- Files: `src/utils/invoiceDashboardData.ts` (`shouldUnionSaleItemsForInvoiceSearch`, `applySearchToSalesQuery`, `countFilteredInvoiceSales`, `fetchInvoiceDashboardStatsClient`).
- One migration replacing `public.search_invoice_sale_ids` (same signature, `SECURITY DEFINER`, `search_path = public`).
- No schema/data changes; behaviour of results stays the same, only the path taken to get them changes.
- Verify with `EXPLAIN (ANALYZE)` before/after on Ella Noor for a customer-name term and a barcode term.
