# Speed, Search & Database Health — Improvement Plan (annotated for live billing)

Measured from live query statistics. Numbers are actual totals, not estimates.

**Constraint:** Tenants bill live on this database. Every step is **read-path / ops only**. No change to money, stock, settlement, payment write paths, or print CSS. Each step ships alone with a build + regression check. Prefer canary (one busy + one quiet org) before broad enable.

---

## Safety / non-goals (must keep)

- Do **not** touch `POSSales` save/pay, receipt voucher creation, CN adjust RPC, `derivePaidAndStatus` / balance formulas, stock triggers, or `@media print` / label templates.

- Do **not** cache POS Dashboard or Sales Invoice Dashboard harder until the known staleness / duplicate-receipt class of bugs is fixed (Parishma-class: retry after unclear failure → second money entry).

- Do **not** cancel, timeout-retry, or auto-resubmit **mutations** (save/pay). Timeouts/abort apply to **search/dashboard reads only**.

- Do **not** drop indexes on a short `pg_stat` window; do **not** drop `printer_presets_backup` / label-template backup tables (app restore uses them).

- Migrations: **new timestamped migrations + GRANTs only** (Lovable-owned). No hand-edit of `client.ts`, `types.ts`, or old migrations.

- Index DDL: `CREATE INDEX CONCURRENTLY`, off-peak only; watch sale-insert p95 during/after.

---

## What is actually slow (measured)

| Rank | Operation | Calls | Avg | Total time |
|---|---|---|---|---|
| 1 | Sale line-item text search (`sale_items` name/barcode/size/colour) | 181,034 | 38 ms | **6,815 sec** |
| 2 | Purchase item lookup by SKU (with bill join) | 5,598 | 121 ms | 677 sec |
| 3 | Sales header search (invoice no / customer / phone / salesman) | 8,066 | 84 ms | 674 sec |
| 4 | Dashboard purchase summary view | 5,331 | 114 ms (peak 2.9 s) | 608 sec |
| 5 | Customer search + full customer list | 46,967 | ~20 ms | 917 sec |
| 6 | Product / variant search (barcode + name expansion) | 35,000+ | 20–106 ms | 1,114 sec |
| 7 | Purchase barcode lookup (historically weak org scope) | 675 | **513 ms** (peak 2.3 s) | 346 sec |

Item 1 is roughly half of all database time.

### Critical schema fact (corrects earlier wording)

`sale_items` / `purchase_items` have **no `organization_id` column**. Tenant scope today is via parent (`sales` / `purchase_bills`) join, pre-fetched id list, or RPC `p_org_id`.  

**Do not** add `.eq("organization_id", …)` on line-item tables — that will 400/error in PostgREST and break live search/print.  

Denormalizing a real column onto line items is **out of scope** for this plan (backfill + every insert path).

### Reconcile the snapshot before sequencing (Step 0a)

Earlier baseline: 167,990 calls / 6,493 sec → now 181,034 / 6,815 sec (growth).

**Split counters by call shape before any rewrite:**

| Shape | Where today | Notes |
|---|---|---|
| Client-batched `sale_items` ILIKE + `sale_id IN (...)` | **POS Dashboard** (`resolvePosSearch` / `fetchPosSaleIdsMatchingLineItems`) | `#230` already did call-shape / debounce / min-length; still not an RPC |
| RPC `search_invoice_sale_ids` | **Sales Invoice Dashboard** + **Command Palette** | Already server-side + `p_org_id` |
| Stats EXISTS on `sale_items` ILIKE | `get_sales_invoice_dashboard_stats` (when search set) | Same SQL family — changing RPC semantics hits this too |
| Other | Quick Sale Check / Stock Report old barcode | Org via `sales!inner` after `#230` / `#181` |

Any rewrite of a “shared” search must reconcile with `#230` and must **not** invent a second Invoice path beside `search_invoice_sale_ids`.

---

## Step 0 — Tenant isolation (before performance work)

Correctness, not ranking.

- Confirm RLS holds on every line-item search path.

- Add **explicit parent-org scope** everywhere it is missing:

  - `sales.organization_id` / `sales!inner` / RPC `p_org_id` for sale lines

  - `purchase_bills.organization_id` for purchase lines / barcode

- Include **Sale Return dashboard** line search on this checklist (return-items ILIKE without a clear parent-org join is a known weak spot).

- Verify with a signed-in session from org A that plan + rows never include org B (two-org negative test).

- Re-check purchase barcode sites that `#181` already fixed — don’t “re-fix” them; only close remaining RLS-only gaps.

---

## Fix plan (ordered by payoff)

### 1. Line-item search — biggest win (call-shape + RPC, not more trigrams)

**Facts:** Partial GIN/trigrams on these columns largely **already shipped**. For the hot `sale_id = ANY(small_set)` shape, the planner prefers the btree and ILIKE stays a residual filter (phase-3). Re-adding trigrams alone is **not** the primary lever and risks peak-hour DDL for little gain.

**Do instead:**

- **POS Dashboard:** route line-item search through one org+date+limit RPC (mirror Invoice’s `search_invoice_sale_ids`), replacing client-batched PostgREST ILIKE.

- **Sales Invoice:** keep / tune existing `search_invoice_sale_ids`; do not fork a second function. Remember Command Palette + stats RPC share this semantics.

- Keep minimum-length gates: **4+ letters, 8+ digits**; keep POS invoice-serial bypass (don’t union line items for short numeric invoice search).

- Add a hard result cap with visible UI: “Showing first N — narrow your search” (no silent truncation — cashiers will re-create bills).

- Indexes: only after call-shape fix, and only if `EXPLAIN` still shows a need; then `CONCURRENTLY`, off-peak.

Expected: fewer calls per keystroke + bounded tenant/date work; avg latency toward single-digit ms **after** shape change.

### 2. Search call volume (typing behaviour)

- One settled search per term: reuse the resolved id set for row query, count, KPI totals, and Excel export (POS already partially does this via `resolvePosSearch` — finish the pattern everywhere it still double-fires, including Invoice count+page).

- Debounce: `#230` shipped POS **400 ms**, Sales Invoice **350 ms**. **Keep both.** Do not lower POS to 350. If one value is required, standardise **up** to 400 as an explicit decision.

- Cancel in-flight **search** requests when the term changes (AbortController). Older responses must not apply and must not keep burning DB time. **Never** abort save/pay.

### 3. Query timeouts and safety limits

- Shared timeout wrapper for dashboard/search fetches (mobile pattern already exists) → retry **search** UI, not endless skeleton.

- Statement-level ceiling on search RPCs so “All Time + short term” fails fast with a clear message.

- Hard result caps + visible “narrow your search” hint.

- On timeout: **no** auto-retry of mutations; toast must not look like “Save failed — tap again” on a payment path.

### 4. Purchase and dashboard queries

- Confirm indexes on purchase hot paths `(organization_id, …)` via **bill/parent** scope; org filter on any remaining barcode lookup still missing it (513 ms class).

- Purchase/stock summary tiles: prefer one aggregated call + longer React Query TTL **only** with existing invalidators wired (StatusBar stock, purchase dashboard). Stale StatusBar stock is a live oversell risk.

- **60 s (or similar) per-org cache: purchase/stock summary tiles only.** POS and Sales dashboards stay excluded until staleness is fixed.

### 5. Customer and product lookups

- Customer picker: **already** server ILIKE + `organization_id` + page size ~200 (`useCustomerSearch`). Further limits need golden tests (name/phone, `hasMore`, settled parties still findable) — wrong customer → wrong receipt.

- Do not conflate Master “load all for report” paths with the POS/Sales picker.

- Product search: reduce 28-way `ILIKE` expansion only with ranking parity tests; **leave POS scan-to-cart path alone** (different code than dashboard search).

### 6. Database housekeeping

- Confirm supporting indexes for every hot predicate still missing after Steps 1–4.

- Do **not** drop indexes on current counters. Require ≥1 full month observation (ideally spanning a GST filing cycle), window start recorded, before any drop proposal.

- Archive/prune only clearly disposable legacy `_backup_*` tables after export + sign-off. **Exclude** printer/label backup tables used by the app.

- Schedule maintenance on highest-churn tables off-peak.

---

## User experience improvements

- Search box: live “searching…” + result count (and truncation hint when capped).

- Date-range default: **separate UX change, sequenced last.** Coordinate with **`#249` (already merged)** filter persistence and the SWR fix that removed mount-time dates from query keys. Persisted choice always wins; bump persistence version if default semantics change; “All Time” stays available with a slower-search hint.

- Skeleton rows keep table layout stable.

- Consistent retry on failed **fetches** (not on pay/save).

---

## Technical notes

- Additive only: new RPCs/indexes + front-end call-site updates.

- No money / stock / settlement formula changes.

- Rollout order: **(0)** isolation + snapshot split by call shape → **(1)** POS RPC + Invoice reuse + caps → **(2)** resolve-once / debounce / abort → **(3)** timeouts → **(4)** purchase + summary TTL → **(5)** customer/product (parity-tested) → **(6)** housekeeping → **(7)** date-default UX.

- Feature-flag new RPCs/cache where practical; rollback = flag off / drop new RPC (not irreversible data drops).

---

## Verification after each step

- Re-read live stats: **call count and total time** for the targeted query.

- Time “All Time” customer/invoice search on Sales dashboard before/after.

- Network: one search resolution per settled term (not N duplicate searches).

- Confirm parent-org predicate (or `p_org_id`) in the final plan for each touched query; two-org negative test.

- Cashier smoke (canary org): short invoice serial find, barcode ≥8 line union, open bill → print lines present, **one** save/pay (no duplicate receipt), StatusBar stock sane after a purchase.

- Watch `rapid_duplicate_receipt` / pay error rate during canary — must not rise.

---

**End of annotated plan.**
