# App loading slowness — diagnostic report

Investigation date: 2026-06-03.  
**Update 2026-06-08:** Phase 1 (shell + tab cache + connection) and Phase 2 (accounts RPC + shared ledger) are **implemented**. See [phase-1-shell-loading.md](./phase-1-shell-loading.md) and [phase-2-cloud-savings.md](./phase-2-cloud-savings.md). Sections below are the **original audit**; strikethrough items are mitigated without changing business formulas.

## Mitigated since audit (no formula / RLS changes)

| Original symptom | Mitigation | Doc |
|------------------|------------|-----|
| Tab switch refetch storm | `TabCachedPages` + `DASHBOARD_TAB_RETURN_QUERY_OPTIONS` | phase-1 |
| POS Dashboard refetch every tab return | `useQuery` + 30s stale (`POSDashboard.tsx`) | phase-1 |
| Purchase / Product dashboard full-page load | Shell-first + table skeleton | phase-1 |
| Purchase Entry blank screen + tab state loss | `OrgLayout` tab cache + session flush | phase-1 |
| Org / connection hang | 4s org sync fail-open; 20s org fetch + cached orgs | phase-1 |
| Accounts lifetime scans on load | `get_accounts_dashboard_metrics` RPC | phase-2 |
| Quick Payments full ledger scan | `fetchCustomersWithBalanceForPaymentPicker` + shared cache | phase-2 |
| Duplicate ledger fetches | `useOrgLedgerReferenceData` | phase-2 |

**Cloud principle:** Fixes use **cache TTL**, **shared query keys**, and **UI shells** — not additional Supabase reads.

---

## Executive summary (original audit)

| Symptom | Most likely cause | Highest-ROI fix (not implemented) |
|---------|-------------------|-----------------------------------|
| **1. Dashboard load** | Sales Dashboard runs **two independent full-range scans** of the month’s invoices plus **`fetchSaleReceiptSplitsForInvoices`** (customer-level receipt pagination with no date bound). POS Dashboard loads **all sales in range + all `sale_items` in background batches** on every visit. | **Sales:** one server-side stats RPC (or derive tiles from a single paginated query); stop full-month `reconciled-stats` duplicate. **POS:** lazy-load `sale_items` only on row expand (Phase 2 still loads all items for the day). |
| **2. After-save** | Save path is **sequential DB** (sale → items → optional SR FIFO loop) then **`invalidateSales`** / dashboard invalidations; POS print **`await`s stock validation + full `saveSale`** before print UI. | Narrow invalidations + defer dashboard refetch until after print; keep SR consume / WhatsApp / commission off the print critical path. |
| **3. Tab switch** | **POS Dashboard refetches on every tab return** via `routePathSegment` + `fetchSales()`; first visit lazy-loads chunk; global **`refetchOnWindowFocus: false`**. | Gate POS `fetchSales` with TTL / stale check instead of refetch on every navigation to `pos-dashboard`. |

---

## 1. POS Dashboard + Sales Dashboard load

### 1A. POS Dashboard — `src/pages/POSDashboard.tsx`

**Data loading model:** Main list uses manual `fetchSales()` in `useEffect` (598–601, 603–612). One `useQuery` for user filter only.

#### Queries on load (typical “daily” default)

| # | Table / API | Filters | Date bound | Lines |
|---|-------------|---------|------------|-------|
| 1 | `organization_members` | `organization_id` | — | 210–213 |
| 2 | Edge `get-users` | auth header | — | 216–218 |
| 3+ | `sales` (1000/page loop) | `organization_id`, `sale_type IN (pos, delivery_challan)`, `deleted_at`, `sale_date` gte/lte | **Yes** | 435–455 |
| 4+ | `credit_notes` (500 `sale_id` batches) | `.in('sale_id')`, `deleted_at` | ID-bound | 477–481 |
| 5 | `credit_notes` (optional) | `.in('id', directCnIds)` | — | 505–508 |
| 6+ | `sale_items` Phase 2 (500 batches) | `.in('sale_id')` only | No `organization_id` | 530–533 |

**Typical load count:** 2 react-query round-trips + **1 + ceil(N/1000)** sales pages + **ceil(N/500)** CN batches + **ceil(N/500)** sale_items batches (e.g. 2,400 bills ≈ **13** Supabase ops).

#### Summary tiles (Sale Amount, Net, Cash, Card, UPI, Balance)

**Not separate DB queries.** Single `useMemo` over `filteredSales` / `saleItems` (1559–1601). Tiles use Phase 1 sales; **Qty** may lag until Phase 2 completes (1566–1568).

#### N+1 (interaction)

| Trigger | Query | Lines |
|---------|-------|-------|
| Expand row | `sale_items` | 649–653 |
| Expand row | `sale_returns` + items | 696–700 |
| Expand row | `sale_financer_details` | 674–678 |
| Delete confirm | `sale_items` count | 743–746 |

`toggleExpanded` awaits per row (713–728).

---

### 1B. Sales Invoice Dashboard — `src/pages/SalesInvoiceDashboard.tsx`

**Default:** `periodFilter = "monthly"` (201) → full calendar month (577–578).

#### React Query on load

| Query key | Purpose | staleTime | refetchOnMount | refetchOnWindowFocus |
|-----------|---------|-----------|----------------|----------------------|
| `org-users-filter` | User filter | 300000 | default | false (228) |
| `invoices` | Table (50/page) | `STALE_LIVE` (0) | **always** (803) | false (802) |
| `shop-names` | Shop filter | `STALE_SETTINGS` | default | false (853) |
| `invoice-dashboard-reconciled-stats` | **Summary tiles** | `STALE_LIVE` (0) | default | false (1054) |
| `cn-adjusted-returns` | CN map | 2m | default | per hook |

**Note:** `invoice-dashboard-stats` is invalidated but **no `useQuery` uses it** in this file.

#### `invoices` query (one page)

| Step | Table | org_id | Date/id | Lines |
|------|-------|--------|---------|-------|
| A | `sales` | Yes | `sale_date` + page range | 605–631 |
| B (search) | `sale_items` | **No** | ilike, limit 300 | 643–653 |
| C (search) | `sales` | Yes | id union | 665–675 |
| D | `fetchSaleReceiptSplitsForInvoices` | Yes on vouchers | Customer receipts: **no date** | 692–700; `customerBalanceUtils.ts` 533–577 |
| E | `sale_returns` | Yes | `linked_sale_id IN` | 702–707 |
| F | `sale_items` | via sale_id | id-bound | 715–719 |
| G | `sales` UPDATE | Yes | stale normalize | 757–766 |

#### `invoice-dashboard-reconciled-stats` — second full scan

Paginates **all invoices in range** (1000/page), then split batches of 200 + `sale_items` batches (947–975), aggregates tiles (1019–1050).

**~16–20+ round-trips on monthly load** with **~2× full-month `sales` reads**.

#### Seq-scan cross-reference (`.cursor/rules/payment-stock-landmines.mdc`)

- **`sale_items` search:** no `organization_id` — **high risk**
- **Receipt splits:** all customer receipts per `customer_id` — **high risk** for heavy payers
- **`sales` list paths:** `organization_id` + `sale_date` — OK
- **`product_variants`:** not on dashboard load

---

## 2. After-save slowness

### `useSaveSale.tsx` (after insert)

| Order | Operation | Blocking | Lines |
|-------|-----------|----------|-------|
| 1 | Number RPC | await | 108–117 |
| 2 | `sales` insert | await | 634–665 |
| 3 | `sale_items` insert | await | 716–718 |
| 4 | Ledger | fire-and-forget | 731–751 |
| 5 | Exchange vouchers | await if exchange | 755–764 |
| 6 | `consumeSaleReturnAdjustments` | await, loop | 774–783 |
| 7 | Points | void | 787–791 |
| 8 | WhatsApp | IIFE | 796–964 |
| 9 | `invalidateSales` | sync invalidate | 966–967 |

**`invalidateSales`** (`useDashboardInvalidation.tsx` 33–44): `dashboard-stats`, mobile stats, `sales-trend`, **`invoices`**, `invoice-dashboard-stats` (unused), `todays-sales`, `pos-dashboard-sales` (unused by POS Dashboard), `today-sales`, customer snapshot, **`notifyPosSalesChanged`** → hidden POS **`fetchSales()`** (POSDashboard 603–608).

### POS print path — `POSSales.tsx` `handlePaymentAndPrint`

Blocking before print: `validateCartStock` → full `saveSale` → optional `saveFinancerDetails` → then print (2849–3011). Invalidates `todays-sales` + `notifyPosSalesChanged` (2888–2889).

### Sale Invoice — `SalesInvoice.tsx`

New save: stock check → number RPC → insert sale/items → financer → invalidate `invoices` + `reconciled-stats` + `dashboard-stats` (2735–2738) → print. With `staleTime: 0`, return to dashboard triggers **full-month refetch**.

---

## 3. Window / tab switch

- **TabCachedPages:** visited tabs stay mounted (hidden); first visit loads lazy chunk; inventory shell fallbacks.
- **POS Dashboard:** ~~refetch every tab return via `fetchSales()`~~ → **`useQuery` + `STALE_DASHBOARD_TAB_RETURN` (30s)**.
- **Purchase / Product / Return dashboards:** `DASHBOARD_TAB_RETURN_QUERY_OPTIONS` on tab return.
- **Sales Dashboard:** mounted but hidden; `refetchOnWindowFocus: false` globally; unified stats use tab-return stale.
- **Global:** `refetchOnWindowFocus: false`, default `staleTime` 30s (`App.tsx`).

---

## 4. Ranked fixes (remaining — measure before changing)

1. **Dashboard:** Single stats source for Sales tiles; scope receipt splits by date; add `organization_id` to `sale_items` search; POS skip bulk Phase 2 `sale_items`.
2. **After-save:** Defer invalidations until after print; non-blocking SR consume on POS.
3. ~~**Tab switch:** POS fetch TTL~~ → **Done** (30s React Query stale). Sales reconciled stats partially improved via tab-return stale.

---

## Verification checklist

- POS daily load: count `sales` + `sale_items` in Network tab; one expand → +2–3 requests.
- Sales monthly load: one month-scoped scan for tiles, not two.
- POS save+print: dialog &lt; ~2s on 20-line cart without full dashboard refetch first.
- Tab POS → Sales → POS within 30s: POS should not replay all `sale_items` batches if TTL gating is added.
