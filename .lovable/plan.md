# Speed, Search & Database Health — Improvement Plan

Measured from live query statistics. The numbers below are actual totals from the database, not estimates.

## What is actually slow (measured)

| Rank | Operation | Calls | Avg | Total time |
|---|---|---|---|---|
| 1 | Sale line-item text search (`sale_items` name/barcode/size/colour) | 181,034 | 38 ms | **6,815 sec** |
| 2 | Purchase item lookup by SKU (with bill join) | 5,598 | 121 ms | 677 sec |
| 3 | Sales header search (invoice no / customer / phone / salesman) | 8,066 | 84 ms | 674 sec |
| 4 | Dashboard purchase summary view | 5,331 | 114 ms (peak 2.9 s) | 608 sec |
| 5 | Customer search + full customer list | 46,967 | ~20 ms | 917 sec |
| 6 | Product / variant search (barcode + name expansion) | 35,000+ | 20–106 ms | 1,114 sec |
| 7 | Purchase barcode lookup (no org filter on items) | 675 | **513 ms** (peak 2.3 s) | 346 sec |

Item 1 alone is roughly half of all database time in the app. The query runs with no `organization_id` filter — it scans line items across every tenant and is filtered afterwards by a list of sale ids.

## Fix plan (ordered by payoff)

### 1. Line-item search — the single biggest win
- Route all line-item search through one server-side function per screen instead of a PostgREST `ILIKE` chain, so the work happens once with tenant + date bounds applied first.
- Add `organization_id` to the search predicate everywhere it is missing (sale line items, purchase line items).
- Trigram indexes on the searched columns so `ILIKE '%term%'` uses an index instead of a scan.
- Keep the existing minimum-length gates (4+ letters, 8+ digits) and add a per-search result cap.
Expected: this query drops from ~38 ms average to single-digit ms and stops being called several times per keystroke.

### 2. Search call volume (typing behaviour)
- One settled search per term: debounce raised to a consistent 350 ms and the same resolved result reused by the row query, the count query, the KPI totals and Excel export instead of each re-running the search.
- Cancel in-flight searches when the term changes (currently older responses still complete and cost database time).

### 3. Query timeouts and safety limits
- A single shared timeout wrapper for every dashboard/search fetch (the mobile one already exists) so a stuck request shows a retry instead of an endless skeleton.
- Explicit statement-level ceiling for search functions so a pathological "All Time + 2 letters" search fails fast and clearly rather than hanging the page.
- Hard result caps with a visible "showing first N — narrow your search" hint, instead of silent truncation.

### 4. Purchase and dashboard queries
- Index purchase line items on `(organization_id, sku_id)` and `(organization_id, barcode)`; add the org filter to the barcode lookup so the 513 ms average collapses.
- Dashboard purchase/stock summary views: cache per organization for 60 s and serve tiles from one aggregated call rather than repeat view reads on every visit.

### 5. Customer and product lookups
- Customer picker: server-side search with a limit instead of loading the whole customer list, plus a longer cache window for the reference list.
- Product search: stop expanding one term into 28 `ILIKE` branches; use a single trigram-indexed match with client-side ranking.

### 6. Database housekeeping
- Confirm supporting indexes exist for every hot predicate and drop indexes that no query uses (write cost with no read benefit).
- Archive/prune the legacy backup tables still sitting in the main schema.
- Schedule regular table maintenance on the highest-churn tables (sale items, sales, vouchers) to control bloat.

## User experience improvements
- Search box shows a live "searching…" state and a result count, so long searches feel responsive instead of frozen.
- Date filter defaults to the current month on heavy dashboards, with "All Time" as a deliberate choice that warns it is slower.
- Skeleton rows keep the table layout stable so the page does not jump when data lands.
- Consistent retry buttons on every failed fetch instead of blank panels.

## Technical notes
- Changes are additive: new database functions and indexes, plus front-end call-site updates. No change to any money, stock or settlement formula.
- Indexes cost a small amount of write time and disk in exchange for large read savings.
- Rollout order: (1) line-item search + indexes, (2) call-volume/debounce, (3) timeouts and caps, (4) purchase + dashboard, (5) customer/product, (6) housekeeping. Each step is verifiable on its own by re-reading the query statistics.

## Verification after each step
- Re-read live query statistics and compare total time for the targeted query.
- Time an "All Time" customer search on the sales dashboard before and after.
- Count network calls per settled search (target: one search call, not several).
