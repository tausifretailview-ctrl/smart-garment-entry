# App slowness: which screens and steps are slow (report)

## Already measured (database side, live data)
- The database is healthy: memory at 37%, 17 of 120 connections in use, no overload alerts since the move to Medium.
- So the slowness comes from specific slow requests and from the browser, not from server size.

Slowest database work (time added up across all calls):

| # | Where it comes from | Calls | Avg | Worst | Likely screen |
|---|---|---|---|---|---|
| 1 | Product-name duplicate check (name search plus stock for every size) | 188 | 635 ms | 3.2 s | Product Entry / Purchase Entry, while typing a product name |
| 2 | Same check, with brand/category columns | 185 | 247 ms | 1.1 s | Product Edit / Merge duplicates |
| 3 | Purchase history lookup by barcode/size | 236 | 117 ms | 0.2 s | Stock report / POS scan of old labels |
| 4 | Sales search by bill number / customer name | 52 + 94 | 348 / 70 ms | 1.1 s | Sales and POS dashboard search |
| 5 | Customer list and search | 687 + 1177 | 26 / 12 ms | 0.3 s | Customer search, called very often |
| 6 | Purchase line lookups by bill | 76 + 189 + 71 | 68–220 ms | 0.7 s | Purchase Bills dashboard / bill open |
| 7 | Barcode-printed update on purchase lines | 30 | 255 ms | 0.3 s | Barcode printing |
| 8 | Saving POS bill lines | 391 | 32 ms | 0.3 s | POS save (acceptable) |

## What the report will add
1. **Database proof:** for the top 6 requests, a read-only check of how the database runs each one, to confirm whether it scans too many rows or is missing an index. Each result names the screen and the source file.
2. **Page load timing in a browser:** open the main screens (Dashboard, POS, POS Dashboard, Sales Invoice Dashboard, Customer Balance, Customer Ledger, Purchase Bills, Purchase Entry, Product Dashboard, Stock Report, Quick Stock), using a signed-in test session where one is allowed. Record:
   - time until the page appears and time until data loads
   - number of requests and the slowest request
   - how much code each page downloads
3. **Code review of the slow screens:** repeated requests (one request per customer or per row), oversized lists loaded on open, and hidden tabs that stay loaded.
4. **Write `docs/slowness-report-2026-10.md`:** a table of page, load time, query time, cause and proposed fix, sorted by impact. It ends with a prioritised fix list, for example:
   - Make the product-name duplicate check stop loading every size's stock, and add a name-search index. This is the top item and fixes the 3-second freezes.
   - Speed up sales search with a faster text index.
   - Cache the customer list instead of re-fetching it on every keystroke or screen open.

The report makes no changes to the app or the data. Fixes are a separate step and need your approval first.

## Limits
- There are no test login details for a live shop, so signed-in browser timings may be limited to one approved account. If that is not possible, the report will rely on database and code evidence and give you browser steps to capture timings on a shop PC.

## Technical notes
- The two slowest requests come from `src/utils/productNameDedupe.ts` and `src/utils/productNameStockMerge.ts` (`products.product_name ilike` plus embedded `product_variants(stock_qty, deleted_at)`). They are called from ProductEntry, ProductEditPanel, PurchaseEntry and MergeDuplicateProductNamesDialog.
- Tools: `pg_stat_statements` ranking (done), `EXPLAIN (ANALYZE, BUFFERS)` through read-only queries, Playwright with the existing `ezzy_nav_perf` / `ezzy_cloud_usage` probes and `window.__ezzyCloudUsage.copyJson()`.
