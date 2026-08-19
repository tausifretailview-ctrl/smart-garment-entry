# Speed up Sales Invoice Dashboard on "All Time" (ELLA NOOR)

## What the reads show

ELLA NOOR has 4,316 invoices and 4,455 receipt vouchers — not huge. The database side is fine: the KPI aggregate query for the whole history runs in ~45 ms on the server, and the invoice list is already server-paginated (50 rows a page).

The delay is in the browser, in the step that reconciles paid/pending for the rows on screen:

- For every page of 50 invoices, the app fires **one separate network request per distinct customer** on that page (up to 50 requests), executed **one after another**, not in parallel. Each round trip is ~100-300 ms, so a single page costs several seconds before badges/balances settle.
- On "All Time" those per-customer requests carry **no date bounds**, so each one pulls that customer's entire receipt history and paginates it in 1,000-row pages.
- The same reconcile runs again on every page change, filter change and refresh.

Any other period (Weekly/Monthly) is faster only because the customer queries are date-bounded — the per-customer request storm is still there.

## What we will change

### 1. Batch the per-customer receipt fetch (main fix)
Replace the loop that queries one customer at a time with chunked `reference_id IN (...)` queries (80 ids per request, matching the existing sale-id chunking). A 50-row page then needs 2 requests instead of ~51. Same rows, same date bounds, same result — only the number of round trips changes.

### 2. Keep All-Time reconcile bounded
When no period is selected, bound the receipt lookup by the oldest sale date on the visible page instead of leaving it open-ended, so old, unrelated vouchers are not downloaded and paginated.

### 3. Avoid re-doing settled work
Cache the reconcile result per page of invoice ids for the session so paging back and forth, or returning to the tab, does not re-run the whole reconcile.

### 4. Keep the KPI tiles as they are
The tiles already come from a single server aggregate and are not the bottleneck; no change needed there.

## Not changing
No money logic, no reconcile formula, no data, no schema. Displayed paid/pending/status values must stay byte-identical — only the fetch shape changes.

## Verification
- Time "open Sales Invoice Dashboard → All Time" on ELLA NOOR before and after, and count network requests for one page load.
- Compare Total Revenue, Pending Amount and the first page's per-row Balance values before and after — they must match exactly.
- Spot-check a customer with many receipts (paid, partial and unpaid rows) on All Time and on Monthly.
