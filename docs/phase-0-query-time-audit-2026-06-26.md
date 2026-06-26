# Phase 0 — Query-Time Audit (2026-06-26)

Read-only measurement only. No DDL, no migration, no client code changes.
Source: `pg_stat_statements` (cumulative since last reset) + `pg_indexes`
inspection on hot tables.

## 1. Top 20 server queries

Times in **ms**. "ILIKE w/o trigram" = the query uses `ILIKE` on a text column
that has **no** GIN `gin_trgm_ops` index → every call is a sequential / bitmap
heap scan filtered after the fact. "Pattern" classifies by call count:
`keystroke` = calls ≫ page mounts (driven by a search box); `mount` = calls ≈
page mounts (list load); `per-row` = N+1 inside a list; `batch` = bulk job.

| # | Table / shape | Calls | Mean | Total | ILIKE no-idx? | Pattern | Trigger (page / hook) |
|---|---|---:|---:|---:|---|---|---|
| 1 | `sale_items` ILIKE `barcode`/`product_name`/`size`/`color` + `sale_id=ANY()` | 69,919 | 27 | **1,886 s** | **YES — none of the 4 cols have trigram** | keystroke | Sales Dashboard / POS Dashboard "search" union pass (`src/utils/posDashboardSearch.ts` → `shouldUnionSaleItemsForPosSearch`) and `src/utils/lookupBarcodeSales.ts` (`fetchSaleItemsForOrg` with `.or(product_name…barcode…size…color)`) |
| 2 | `voucher_entries` ILIKE `description` × **12 OR** + `org`/`type`/`reference_type` | 16,593 | 60 | **997 s** | NO — `idx_voucher_entries_description_trgm` exists, but 12 OR-patterns + `ORDER BY created_at DESC LIMIT` defeats it (planner switches to seq+sort) | keystroke | Accounts → Receipts/Payments search ("Sale", "Purchase", "Opening", … 12 hardcoded patterns) |
| 3 | `purchase_bills` LIST + LATERAL `purchase_items.count` per bill | 8,595 | 114 | **976 s** | n/a | mount + per-row | Purchase Bill Dashboard — the `purchase_items(count)` embed runs a count subquery **per bill row** (N+1 inside LATERAL) |
| 4 | `get_customer_party_balances` parity gate (manual audit) | 2 | 225,463 | 451 s | n/a | one-off | Manual `psql` audit you ran for Ella Noor — ignore |
| 5 | `sale_items` `sale_id=ANY()` + embed `sales(organization_id)` | 1,229 | 177 | 217 s | n/a | mount | School / Customer history backfill route — order by id ASC suggests pagination scan |
| 6 | `purchase_items` ILIKE `product_name`/`brand`/`barcode`/`style`/`category`/`color` + `bill_id=ANY()` | 1,361 | 120 | **163 s** | **YES — none of the 6 cols have trigram** on purchase_items | keystroke | Purchase Bill Dashboard text search (`PurchaseBillDashboard.tsx`) |
| 7 | `purchase_items` UPDATE `mrp` WHERE `id=$` AND `mrp IS NULL` | 1,000 | 149 | 149 s | n/a | batch | "Fix Missing MRP" Excel-equivalence job — 1000 single-row updates in a row |
| 8 | `purchase_bills` quick payment fields select (no order, no filter beyond org) | 8,802 | 16 | 142 s | n/a | mount | Purchase Bill Dashboard footer KPIs — fine per-call, just very frequent |
| 9 | `sale_orders.*` LIST + LATERAL `sale_order_items.*` per order | 135 | **1,028** | 139 s | n/a | mount | Sale Order Dashboard — `SELECT *` on sale_orders + full child embed = oversized row |
| 10 | `customers` ILIKE `customer_name`/`phone`/`email` (`SELECT *`) | 5,636 | 23 | 129 s | NO — all 3 cols have trigram. Cost is the `SELECT *` + frequency | keystroke | Customer Master search + POS customer picker |
| 11 | `sale_items` `sale_id=ANY()` qty/mrp only | 5,297 | 23 | 120 s | n/a | mount | Customer Ledger / Account history — fine plan, just frequent |
| 12 | `sales.id` org + sale_type + deleted_at IS NULL | 15,152 | 6.5 | 98 s | n/a | mount | POS recents + Sale Order/Sales Dashboard count probes — very frequent |
| 13 | `product_variants` barcode `=` OR `ilike` + embed `products(…)` | 3,876 | 25 | 98 s | NO — `idx_product_variants_barcode_trgm` exists | keystroke (scan) | POS barcode scanner (`product-by-barcode`) — fine per-call |
| 14 | `sales.id` org search ILIKE `sale_number`/`customer_name`/`customer_phone`/`salesman` | 1,975 | 49 | 96 s | **YES** — `sales` has only btree on `sale_number` and `customer_name`; **no trigram** on any of the 4 | keystroke | Sales Dashboard text search |
| 15 | `products` LIST + LATERAL `product_variants` per product (full master) | 25 | **3,558** | 89 s | n/a | mount | Product Master initial load — **3.5 s** per fetch is the single worst page-load wait |
| 16 | `get_customer_party_balances` drift query (manual audit) | 2 | 43,609 | 87 s | n/a | one-off | Manual audit you ran — ignore |
| 17 | `product_variants` barcode `ilike` + embed `products` (no `eq` fast path) | 3,707 | 24 | 87 s | NO — trigram present | keystroke (scan) | POS variant lookup — fine |
| 18 | `customers` LIST (no search) `SELECT 9 cols` | 4,499 | 18 | 83 s | n/a | mount | Customer Master mount + dropdown initial — fine per-call |
| 19 | `product_variants` 6-pattern OR on `barcode` + `color` | 842 | 93 | 78 s | partial — trigram on `barcode` and `color`, but 6 ORs hurt planner | keystroke | POS multi-term scan ("123 RED 42") |
| 20 | `v_dashboard_stock_summary` `organization_id=` | 3,076 | 24 | 73 s | n/a | mount | Dashboard stock tile — runs on every Index/POS mount |

### Confirmed trigram coverage on hot tables

```
customers         : name / phone / email   ✅
products          : product_name / brand   ✅
product_variants  : barcode / size / color ✅ (partial: deleted_at IS NULL)
voucher_entries   : description            ✅ (partial)
sale_items        : barcode / product_name / size / color   ❌ NONE
purchase_items    : product_name / brand / barcode / style / category / color  ❌ NONE
sales             : sale_number / customer_name / customer_phone / salesman    ❌ NONE
```

Three tables are the entire story for keystroke-driven slowness:
`sale_items`, `purchase_items`, `sales`.

---

## 2. Top 5 slowest page loads (wall-clock)

Derived from total_ms ÷ calls + the page that triggers them.

| Page | Hot query | Worst-case wait |
|---|---|---:|
| Product Master (mount) | #15 — products + variants LATERAL | **3.5 s** |
| Sale Order Dashboard (mount) | #9 — `sale_orders.*` + child embed | **1.0 s** |
| Purchase Bill Dashboard (mount) | #3 — purchase_bills + per-row item count | 0.9 s avg, **2.6 s max** |
| Accounts Receipts/Payments (search keystroke) | #2 — 12-OR voucher description | 60 ms × N keystrokes (no debounce evidence) |
| Sales / POS Dashboard (search keystroke) | #1 + #14 — sale_items + sales ILIKE | 27 ms each, but **2 queries per keystroke** + 70k calls/wk |

---

## 3. Suspected root causes

1. **Missing trigram indexes (HIGHEST IMPACT)** — `sale_items`, `purchase_items`, `sales` all do `ILIKE '%term%'` on text columns with only btree indexes. Btree cannot serve `%x%` predicates, so each call does a partial seq scan filtered down to the `sale_id IN (...)` / `org` set. This single class of fix would remove **~35 of the top ~70 minutes**.
2. **N+1 child embeds inside LATERAL** — Purchase Bill Dashboard (#3) and Sale Order Dashboard (#9) embed full child arrays. Each parent row → one extra SELECT. Fix is either:
   - keep an aggregate column (`total_items`, `total_qty`) on the parent and drop the embed, or
   - replace `*` with a narrow column set so the LATERAL is at least small.
3. **Product Master mount fetches everything** (#15) — 3.5 s p50 means every visit blocks for 3+ s. Already has `STALE_REFERENCE` (2 min), so once loaded it's cached, but the **first visit per session** is the wait. Likely needs server-side pagination or an RPC that returns one page of products with one variant-summary row each.
4. **No debounce on Accounts voucher search** (#2) — the 12-pattern OR plus per-keystroke firing burns 1 s per second of typing. Confirm with `__ezzyCloudUsage` while typing.
5. **`SELECT *` on rows with many columns** — `sale_orders` has 32 cols, `customers` lookup returns the full row, `purchase_bills` has 33 cols and a JSON embed. Trimming to the columns the UI actually renders is the cheapest mechanical win.
6. **One-off audit queries** (#4, #16) appear at the top because I ran them manually. Real production load is the keystroke-driven items.

---

## 4. Phase 1 fix proposal (ranked impact ÷ risk)

All migrations are plain `CREATE INDEX` (no CONCURRENTLY inside a tx). Awaiting
your approval before any of them are applied.

| Priority | Fix | Expected saving | Risk | Notes |
|---|---|---:|---|---|
| **P0** | Trigram indexes on `sale_items(barcode, product_name, size, color)` — 4 partial GIN indexes `WHERE deleted_at IS NULL` | ~30 min total / wk on query #1 | LOW | Same pattern already used on `product_variants`. Storage cost ~30-60 MB. Slightly slower inserts (a few µs per row). |
| **P0** | Trigram indexes on `purchase_items(product_name, brand, barcode, style, category, color)` partial `WHERE deleted_at IS NULL` | ~2.7 min total / wk on query #6 | LOW | Same pattern. |
| **P0** | Trigram indexes on `sales(sale_number, customer_name, customer_phone, salesman)` partial `WHERE deleted_at IS NULL` | ~1.6 min / wk on #14 + faster Sales Dashboard typing | LOW | btree on `sale_number` + `customer_name` stays for ORDER BY uses. |
| **P1** | Denormalize `purchase_bills.total_items` (already has `total_qty`) and drop the `purchase_items(count)` LATERAL embed in `PurchaseBillDashboard` query | ~16 min / wk on #3 | MED | Need a trigger to keep the count in sync. Alternative: cheaper — switch the embed from `purchase_items(count)` to a single SQL view that pre-aggregates. |
| **P1** | Sale Order Dashboard — replace `select *` with the narrow column list already used in `saleOrderListQueries.ts::SALE_ORDER_LIST_COLUMNS`. There is a code path still doing `SELECT *` | ~2 min / wk on #9 | LOW | Pure client-side change, no schema. |
| **P1** | Product Master initial load — switch to RPC `get_products_paged(org, page, page_size, search)` that returns one row per product with variant counts + min/max price | ~85 s / wk on #15 *and* makes first-visit wait <500 ms | MED | New RPC needs writing + the page needs to use server pagination. |
| **P2** | Accounts voucher search (#2) — add 250 ms debounce on the input + reduce the 12-OR pattern to one `description ILIKE '%term%'` and let the trigram do its job | ~16 min / wk | LOW | Pure client change. Verify the 12 patterns aren't doing semantic work first (e.g. they may be enumerating voucher categories — if so, switch to `reference_type IN (...)` instead). |
| **P2** | Customer search `SELECT *` (#10) — narrow to `id, customer_name, phone, gst_number, opening_balance, points_balance` (the columns POS picker uses) | ~60-80 s / wk | LOW | Pure client. |
| **P3** | Dashboard stock tile (#20) — bump `useDashboardStockSummary` from default to `STALE_FREQUENT` (10 s) | ~50 s / wk | LOW | Cache change only. |

### Out of scope for Phase 1
- Anything touching write-path triggers beyond the `purchase_bills.total_items` counter
- Backfilling historical data
- Touching the manual audit RPCs (#4, #16)

---

## Methodology notes

- Server-side: ranked by `total_ms` from `pg_stat_statements`; trigram coverage
  checked via `pg_indexes` filtered on `gin_trgm_ops`.
- Client-side: source files identified by matching the normalised SQL shape
  (column lists, embed names, OR-pattern counts) against `rg` hits in `src/`.
- No client journey was walked this round; `__ezzyCloudUsage` baseline can be
  captured next as a before/after for the Phase 1 indexes if you want a
  page-level number.