# Speed and smooth page switching: suggestion plan (no changes yet)

## Where things stand today (checked live, 10 Oct)
- Server is healthy on Medium: memory 64%, 51 of 120 connections, 1.62 GB data, no overload alerts. A bigger server will not fix the lag.
- The lag comes from a few slow searches that run very often, plus too much work in the browser when you open or switch pages.

Slowest database work right now (time added up across all calls):

| # | What the user is doing | Calls | Avg | Worst |
|---|---|---|---|---|
| 1 | Typing a product name (duplicate check, also loads stock of every size) | 1,189 + 188 | 290–635 ms | 3.2 s |
| 2 | Searching bills on Sales / POS dashboard (bill no, name, phone, salesman) | 1,042 + 435 + 286 | 210–430 ms | 1.3 s |
| 3 | Searching items by size / colour / barcode text | 476 + 548 | 310–460 ms | 1.6 s |
| 4 | Looking up purchase history for scanned items | 1,582 + 485 | 130 ms | 0.7 s |
| 5 | Product search on name/brand/style/category | 548 | 175 ms | 0.9 s |
| 6 | Customer search and full customer list | 7,118 + 2,704 | 13–24 ms | 0.5 s |

Number 6 is cheap per call but runs about 10,000 times, so it is mostly wasted repeat work.

## Suggested changes, in order of impact

### Phase A: fix the slow searches (biggest win, low risk)
1. Product name check: match on a cleaned-up name with a direct index, and load stock only for the product that matched. This removes the 3-second freezes in Product Entry and Purchase Entry.
2. Bill search: pick the field from what was typed (numbers go to bill no or phone, letters go to customer name), search only after 3 characters, and stop counting the total on every keystroke.
3. Item search by size, colour or barcode: search barcode first by exact match, then fall back to text; add a matching index for colour and size.
4. Purchase history lookups: request only the columns needed and send at most 200 items per request.
5. Customer search: wait 300 ms after typing stops, keep the customer list cached for 2 minutes, and share it between POS, Sale Bill and payments instead of loading it again on each screen.

### Phase B: pages that open slowly
6. Sales and POS dashboards: check payments for all customers on the page in one request instead of up to 50 one after another.
7. Customer Balance and Ledgers: use the existing one-step balance summary instead of scanning every bill in the shop; load ledger detail only when a customer is opened.
8. Quick Stock: load the stock window on its own instead of with the large reports pack, so the spinner goes away.
9. Purchase Entry and Sale Bill: load rarely used pop-ups only when they are opened.

### Phase C: smooth page switching without lag
10. Close hidden tabs that have not been used for 10 minutes (bill entry tabs with unsaved work are kept). This lowers memory use and should reduce browser crashes like the one at DUA BY SALEEM'S.
11. Load the code for the next likely pages in the background once the current page is idle, so menu clicks open right away.
12. When going back to a page you saw in the last 30 seconds, show the saved data right away and refresh it quietly.
13. Show the page layout immediately with grey placeholders, instead of a full-screen loading message.

### Phase D: keep it fast
14. Add a small speed log (off by default) that records page open time and the slowest request, so a shop can send a report.
15. Check the slow-query list once a month and remove indexes that are never used, which makes saving faster.
16. Clean old WhatsApp logs and audit logs on a schedule (the backlog is 800 MB) so the database stays small.

## Expected result
- Product typing and bill search: from 0.3–3 s down to under 0.1 s in most cases.
- Dashboards: open in about 1 s instead of several seconds on busy shops.
- About 60–70% fewer repeated requests, which also lowers cloud usage.

## Limits
- No signed-in page timings were captured, because there is no test login for a live shop. Phase D step 14 gives shops a way to measure before and after.
- Each phase is a separate step and needs your approval. Bill amounts, balances and stock figures will not change.

## Technical notes
- Sources: `productNameDedupe.ts`, `productNameStockMerge.ts` (#1); `SalesInvoiceDashboard.tsx`, `POSDashboard.tsx` search plus `count=exact` (#2, #6); variant search in POS/size search report (#3); `stockReportPurchaseBarcodeResolve.ts` purchase_items `sku_id = ANY` (#4); customer pickers (#5, use `STALE_REFERENCE`, shared query key).
- DB: generated `name_key` column plus btree `(organization_id, name_key)`; trigram indexes for variant color/size; `planned` count instead of `exact`; verify each with EXPLAIN ANALYZE before and after.
- Frontend: idle eviction in `TabCachedPages.tsx` (reuse `recentTabPaneRetention.ts`), split `FloatingStockReport` out of `FloatingPOSReports.tsx`, use `lazyWithRetry` for dialogs, no console logs on hot paths.
- Retention: the existing `archive_whatsapp_logs_older_than` and `archive_audit_logs_older_than` functions, run by a scheduled job.
