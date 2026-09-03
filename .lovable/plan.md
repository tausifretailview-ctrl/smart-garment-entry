# Cloud usage reduction and speed plan

## What I checked today (live backend, read-only)

- `sale_items.organization_id` now exists and is **100% backfilled** (156,430 / 156,430 rows), with org-scoped trigram indexes (`idx_sale_items_org_product_name_trgm`, `_barcode_`, `_size_`, `_color_`).
- The org-scoped RPCs are deployed: `get_dashboard_stock_summary`, `get_dashboard_purchase_summary`, `search_line_item_sale_ids`, `search_invoice_sale_ids`, `search_pos_sale_ids` — and the client already calls them (`src/utils/dashboardSummaryRpcs.ts`, `src/utils/lineItemSaleSearch.ts`).
- Log analytics (`edge_logs`) returned **no rows** for the last 7 days, so per-day HTTP request counts cannot be read from here. Statement statistics are the only usable signal, and they are **cumulative since the last stats reset** — they include traffic from before Phases 2–4 shipped.

Cumulative top statements (total server time):

| Statement | Calls | Mean | Total |
|---|---|---|---|
| `sale_items` ILIKE + `sale_id = ANY(...)` (pre-RPC pattern) | 181,080 | 38 ms | 114 min |
| `sale_items` by sale ids (qty, mrp) | 30,147 | 88 ms | 44 min |
| `sales` header search with **exact count** | 15,109 | 99 ms | 25 min |
| `customers` **full org list**, no search filter, name-ordered | 50,246 | 24 ms | 20 min |
| `customers` search (name/phone/email ILIKE) | 58,283 | 21 ms | 20 min |
| `v_dashboard_stock_summary` (old view) | 33,509 | 34 ms | 19 min |
| `products` 28-way OR ILIKE | 40,464 | 22 ms | 15 min |
| `v_dashboard_purchase_summary` (old view, max 2.97 s) | 11,290 | 74 ms | 14 min |
| `purchase_items` barcode `%...%` + bill join | 2,043 | **410 ms** | 14 min |

Because these counters are cumulative, **the first step is to establish whether the top rows are still happening today** rather than assuming they are.

## Plan

### Step 1 — Establish a real daily baseline (measurement only)
Take two statement snapshots ~24 h apart and diff them, so we get calls/day per statement instead of lifetime totals. Same for a signed-in browser capture on the busiest shop using the existing `window.__ezzyCloudUsage` tooling and the journey in `docs/cloud-usage-baseline.md`, pasted into the Phase 6 capture slot. Output: a one-page "requests per shop per day, by route" table. Everything after this is prioritised by that table, not by lifetime totals.

### Step 2 — Kill the remaining full-table list reads
The `customers` full-list read (50k calls, no filter, ordered by name across the whole org) is the clearest avoidable cost: it is a list fetch where a search would do. Replace remaining "load all customers / all variants then filter in JS" call sites with the existing server-side search paths, and cache the picker result per org for the session instead of per dialog open.

### Step 3 — Cheaper search shapes
- `products`: collapse the 28-way OR ILIKE into one trigram search RPC.
- `purchase_items` barcode: exact / prefix match instead of `%barcode%` (410 ms mean today).
- Replace `count: "exact"` with planned/estimated counts on the large paginated dashboards (47 call sites exist; only the big-table ones matter — school/settings counts stay).

### Step 4 — Fewer requests per screen
- Audit React Query tiers so every reference/settings query uses `STALE_REFERENCE` / `STALE_SETTINGS` and no dashboard refetches on mount or focus (most already do — this closes the stragglers).
- Confirm background polling stays off for hidden tabs and for the `free` tier (`useTierBasedRefresh` already returns `false`), and lengthen `fast` polling where a manual refresh is enough.
- Trim wide `select("*")` payloads on list screens to the columns the table renders — this is egress, which is billed separately from query time.

### Step 5 — Retire the old dashboard views
Once Step 1 confirms no client still hits `v_dashboard_stock_summary` / `v_dashboard_purchase_summary`, drop the view reads from the codebase and leave the RPCs as the only path, so a stale bundle cannot reintroduce the 2.97 s query.

### Step 6 — Guardrails so it stays cheap
A CI check that fails when a new `select("*")` on a large table, a new unfiltered full-list fetch, or a new `count: "exact"` on `sales` / `customers` / `product_variants` is added. Plus a short "cloud budget" note in `docs/cloud-usage-baseline.md` with the per-day numbers from Step 1 as the reference to compare each release against.

## Technical notes
- No money logic, no RLS changes, no schema semantics change. New RPCs use `search_path = public`, `EXECUTE` to `authenticated` only, revoked from `PUBLIC`/`anon` per the existing DDL trigger.
- Statement statistics will **not** be reset — snapshots are diffed instead, so other audits keep their history.
- Each step is verified with `EXPLAIN (ANALYZE, BUFFERS)` before/after and a re-diff of the statement snapshot.

## Verification
1. Requests per shop per day drop measurably against the Step 1 baseline.
2. POS search, customer picker, barcode scan and dashboards return identical rows to today.
3. No new statement timeouts (57014) in the following week.
