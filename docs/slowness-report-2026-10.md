# EzzyERP slowness report — 2026-10-08

Read-only. No app or data changes.

## 1. Server health (after Medium upgrade)

| Metric | Value | Verdict |
|---|---|---|
| Memory | 37% | OK |
| Connections | 17 / 120 | OK |
| Pool clients | 1 / 600 | OK |
| DB size | 1.60 GB (disk 33%) | OK |
| Exhaustion alerts (48h) | none | OK |

**Conclusion:** the server is not the bottleneck. Slowness comes from specific requests and browser-side work.

## 2. Slowest database requests (pg_stat_statements, ranked by total time)

| # | Request | Calls | Avg | Max | Total | Screen / source |
|---|---|---|---|---|---|---|
| 1 | Product-name duplicate check (`ilike '%a%b%c%'` + all variants' stock) | 188 | 635 ms | **3.16 s** | 119 s | Product Entry, Product Edit — `src/utils/productNameDedupe.ts` `findProductNameMatch` |
| 2 | Same with brand/category | 185 | 247 ms | 1.12 s | 46 s | Merge duplicates, Purchase Entry — `productNameStockMerge.ts`, `productNameDedupe.ts:33` |
| 3 | Purchase history by sku_id with bill join | 236 | 117 ms | 233 ms | 28 s | Stock report / POS old-label resolve |
| 4 | Sales search (sale_number OR customer_name OR phone ilike) | 52 | 348 ms | 1.13 s | 18 s | Sales Invoice / POS dashboard search |
| 5 | Customer list (with gst etc.) | 687 | 26 ms | 185 ms | 18 s | Customer pickers — very high call count |
| 6 | purchase_items bill_id = ANY(...) | 76 + 189 | 220 / 68 ms | 698 ms | 30 s | Purchase Bills dashboard |
| 7 | sales list page | 83 | 178 ms | 679 ms | 15 s | Sales dashboard |
| 8 | Customer search | 1177 | 12 ms | 319 ms | 14 s | POS customer search (per keystroke) |
| 9 | sale_items insert | 391 | 32 ms | 319 ms | 13 s | POS save — acceptable |
| 10 | purchase_items by single sku_id | 49 | 228 ms | 386 ms | 11 s | Barcode/history lookup |
| 11 | purchase_items by bill, `select *` | 71 | 122 ms | 649 ms | 9 s | Purchase bill open |
| 12 | barcode_printed update | 30 | 255 ms | 335 ms | 8 s | Barcode printing |
| 13 | sales.* + customer join | 2753 | 3 ms | 237 ms | 8 s | Called 2,753× — repeated fetches |

## 3. Query plan findings (EXPLAIN ANALYZE, largest product catalog, 9,067 products)

- **#1 product-name check:** the pattern puts `%` between every letter (`%k%u%r%t%i%`), so the trigram index cannot narrow it. When the name is new (the normal case while typing), Postgres reads **every product in the shop** (`Rows Removed by Filter: 9067`), and for each match it also builds a JSON list of every size's stock. Warm cache: 12 ms. Cold or busy, and on larger shops: up to 3.2 s (observed). It runs on name entry, so the screen feels frozen.
- **#4 sales search:** with matching rows it is quick (<1 ms). The 1.1 s worst case happens on shops with many bills when the term matches nothing, so the OR filter falls back to a scan. Trigram indexes on all three columns exist, but the `organization_id` index is chosen first.
- **#3 / #6 / #10 / #11:** suitable indexes already exist (`idx_purchase_items_sku_created`, `idx_purchase_items_bill`). The cost comes from wide `select *` rows and large `ANY(...)` arrays, not from missing indexes.
- **#5 / #8 / #13:** each call is cheap; the cost is the **call count** (re-fetch on mount, tab return, and keystroke).

## 4. Browser / page-load side (from code review; no live timing)

No signed-in timing was captured. There are no non-production test credentials, and the backend is live. Known browser-side costs from the code:

| Area | Cause | File |
|---|---|---|
| Sales / POS dashboard | Per-customer voucher reconciliation, up to 50 sequential requests per page and unbounded on All Time | `SalesInvoiceDashboard.tsx`, `POSDashboard.tsx` |
| Every tab | 30+ hidden tabs stay mounted on web, which raises memory (a likely factor in Edge `STATUS_ACCESS_VIOLATION`) | `TabCachedPages.tsx` |
| Purchase Entry | Heavy dialogs imported statically, so a large first download | `PurchaseEntry.tsx` |
| Quick Stock | Spinner while the big `FloatingPOSReports` chunk loads | `FloatingPOSReports.tsx` |
| Customer Balance / Ledger | Full-org scans and repeated phone-map fetches | customer balance utils |

### How to capture real page timings on a shop PC
```js
localStorage.setItem('ezzy_nav_perf','1'); localStorage.setItem('ezzy_cloud_usage','1'); location.reload();
// use the slow screens, then:
window.__ezzyNavPerf.printReport(); window.__ezzyCloudUsage.copyJson();
// after a slow POS save:
window.__ezzyPosSave.print();
```
Turn the flags off afterwards.

## 5. Prioritised fix list (each needs approval)

1. **Product-name check:** search on a normalised name column (indexed equality on the match key) instead of `%a%b%c%`, and fetch stock only for the matched product. Removes the 3 s freezes. *High impact, low risk.*
2. **Debounce / cache customer list and search:** cuts about 1,900 calls per window. *Medium impact.*
3. **Batch dashboard voucher reconciliation:** one request per 80 customers instead of one per customer. *High impact on Sales / POS dashboards.*
4. **Evict hidden read-only tabs after idle on web** (as Electron already does): lowers memory and browser crashes.
5. **Sales search:** require ≥3 characters and search the field that fits the input (digits → phone/bill number) so the trigram index is used.
6. **Purchase lines:** select only the needed columns instead of `select *`, and chunk `ANY(...)` arrays at ≤200.
7. Lazy-load heavy Purchase Entry dialogs and the Quick Stock chunk.
