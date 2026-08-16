# Speed up POS Dashboard load & customer search (SM HAIR REPLACEMENT)

## What is happening now

SM HAIR REPLACEMENT has 7,695 POS bills (Dec 2025 → today) and the count grows daily. The dashboard table is already server-paginated, so the slowness is not the page size — it comes from three places that still scan the whole history:

1. **Customer search resolves over all bills, unbounded.** When you type a customer name, the app first runs a query that returns *every* matching sale id in the organisation's entire history — no date limit, no row limit. One customer in this org has 226 bills; that id list is then re-sent as a giant `id IN (...)` filter to the table query, to the row-count query, and again to the KPI query. Three passes of the same full-history work per keystroke batch.
2. **KPI tiles switch to full-history mode during search.** While a search is active the summary call passes no date range, so the totals RPC aggregates the whole organisation instead of the selected period.
3. **Every page fetch pulls all 64 sale columns plus a receipt-voucher crawl.** On All Time that crawl covers 12 months of vouchers for the rows on screen, on top of a credit-note lookup.

## What we will change

### 1. Bound and cache the search resolution
- Cap the header-match query (limit to the top N most recent matches, ordered by date) and keep it inside the selected date window unless the input looks like an invoice serial.
- Resolve the search **once** per filter combination and share it between the table, the count, and the KPI query instead of recomputing it three times.
- When the search resolves to a single customer, filter by `customer_id` (indexed) rather than a long id list.

### 2. Keep KPIs in the selected period during search
Pass the active date range to the totals RPC even when a search is present, so tiles aggregate the same window shown in the table.

### 3. Trim the per-page payload
- Replace `select("*")` with the explicit column list the table actually renders.
- Only run the receipt-voucher settlement crawl for rows that can still be unsettled (skip fully paid / cancelled / hold rows), and narrow its lookback for wide ranges.

### 4. Faster default landing
Keep the dashboard opening on the current day/month range (as today) and make "All Time" a deliberate click, with a short note that it scans full history.

### 5. Database indexes
Add composite indexes matching the real query shapes so search and pagination use an index instead of a sequential scan:
- `(organization_id, customer_id, sale_date DESC) where deleted_at is null`
- `(organization_id, sale_type, sale_date DESC) where deleted_at is null`

Trigram indexes on `customer_name`, `customer_phone` and `sale_number` already exist and will be reused.

## Verification
- Time "open dashboard (This Month)" and "search a customer with 200+ bills" before and after, on this organisation.
- Confirm totals on the KPI strip match the table for the same filters.
- Confirm invoice-number search (e.g. typing `1029`) still finds old bills outside the date window.

## Notes
No data is changed — this is query, index and fetch-shape work only. The improvements apply to every organisation, not just SM HAIR REPLACEMENT.
