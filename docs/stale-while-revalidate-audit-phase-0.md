# Stale-while-revalidate audit — Phase 0 (read-only)

**Date:** 2026-08-07  
**Scope:** Cache behaviour only — when the user returns, do they see last-known data or a blank/skeleton?  
**Not in scope:** New skeletons, retention changes, query rewrites for speed, quiet-refresh indicator (Phase 1+).

## Global mitigations (already in place)

| Layer | Behaviour | Implication |
|-------|-----------|-------------|
| Pane retention | 5 min, LRU 7, default-retain cacheable paths | Revisit usually **keeps the React tree mounted** — no remount at all |
| App `QueryClient` (`App.tsx`) | `staleTime: 60s`, `gcTime: 24h`, `refetchOnWindowFocus: false`, `placeholderData: keepPreviousData`, `notifyOnChangeProps: ["data","error"]` | Most queries keep previous data; `isFetching` flips do not re-render unless the page tracks `isFetching` |
| `DASHBOARD_TAB_RETURN_QUERY_OPTIONS` | `staleTime: 120s`, `gcTime: 30m`, `refetchOnMount: false`, `keepPreviousData` | Sales/Purchase/Master dashboards that opt in |

**Retention vs remount:** Within the 5-minute window the pane often never unmounts, so a mount-time date key only bites when the pane was **evicted** (LRU, Electron single-tab, exclusion, or retention expiry) and remounts. Fixing cache-busters still matters for post-eviction revisit and for cold open of a second window onto the same page.

**`gcTime` vs retention:** Default `gcTime` is 24h. No registry page was found with `gcTime < 5 min`. Edge case: `DailySaleAnalysis` uses `gcTime: 5 min` (equal to retention) — acceptable while the pane is mounted (query stays observed).

---

## Verdict legend

| Verdict | Meaning |
|---------|---------|
| **OK** | Stable keys; loading on `isLoading` / absence of data; cache outlives retention |
| **cache-buster** | Query key includes mount-time `Date` (or equivalent) so remount misses cache → `isLoading` skeleton |
| **skeletons on isFetching** | UI replaces content with spinner/blank while `isFetching` even when cached `data` exists |
| **gcTime too short** | `gcTime` &lt; retention window (none found for registry pages) |
| **intentional refetch** | Correctness requires fresh data (POS/bill entry, live settlement) — do not “fix” |

---

## Priority findings (fix first in Phase 1)

### Cache-busters (biggest perceived win after eviction / remount)

| Page (registry path) | Key problem | staleTime / gcTime | Loading branch | Verdict |
|----------------------|-------------|--------------------|----------------|---------|
| `daily-cashier-report` | `useState(new Date())` → raw `Date` in 4 query keys (`cashier-report-receipts` etc.); sales key uses YMD and is fine | sales `30s` / app default; others inherit | `isLoading` | **cache-buster** |
| `hourly-sales-analysis` | `dateRange.from/to` are mount-time `Date`s in `queryKey` | app default (60s / 24h) | `isLoading` | **cache-buster** |
| `sales-report` / `sales-report-by-customer` | `endDate = useState(new Date())` (and start-of-month Date) in keys; queryFn uses YMD | `5m` / `30m` | `isLoading` | **cache-buster** |
| `sales-analytics` | `dateRange` object can hold mount-time `Date`s for `today` / `yesterday` / `this-year` periods; object in key | `60s` | loading flags | **cache-buster** (conditional on period) |

### Skeletons / blank on `isFetching`

| Page | Pattern | Verdict |
|------|---------|---------|
| `customer-account-statement` (`CustomerLedgerPage`) | Table: `isFetching ? "Loading ledger..."` | **skeletons on isFetching** |
| `customer-account-statement-audit` | KPI/`!isFetching` + table `isFetching ? "Loading…"` | **skeletons on isFetching** |
| `customer-balance-activity` | Main content gated on `!isFetching` (blanks cached UI) | **skeletons on isFetching** |
| `customer-audit-report` | Table: `isFetching ? "Loading…"` | **skeletons on isFetching** |
| `accounting-reports` | GL Trial / P&amp;L / BS: `isFetching ? <Loader2/>` | **skeletons on isFetching** |

**Shared pattern (not a shared hook):** Statement Audit, Balance Activity, and Customer Audit Report are near-clones — same `ymdBoundary(fromDate)` → `fromYmd`/`toYmd`, same `useQuery` + `isFetching` destructure, same table branch `isFetching ? "Loading…"`. Customer Ledger is a sibling of that pass (same loading-row idiom). Accounting Reports GL tabs are a separate but identical `isFetching ? <Loader2/>` branch. Fix as one consistent change (`isLoading && !data` / keep rows while fetching), not five one-offs.

Contrast (already correct): `customer-party-balances`, `supplier-party-balances`, `third-party-balances`, `sale-order-dashboard`, `sales-invoice-dashboard` — use `isFetching && !isLoading` only for a small refresh cue.

### Cache-buster batch status

| Page | Status |
|------|--------|
| `daily-cashier-report` | Fixed — keys use `rangeStartYmd` / `rangeEndYmd` |
| `hourly-sales-analysis` | Fixed — keys use YMD strings |
| `sales-report` | Fixed — keys use YMD strings |
| `sales-analytics` | Fixed — keys use YMD strings (not `dateRange` object) |

### Intentional refetch (do not “fix”)

| Page | Why |
|------|-----|
| `pos-sales`, `pos-delivery-challan` | Live cart / stock / barcode; excluded from retention |
| `sales-invoice`, `purchase-entry`, `purchase-return-entry`, `sale-return-entry`, `quotation-entry`, `sale-order-entry` | Bill entry; stock & totals must be current |
| `product-entry` | Product/variant mutations; live stock grids |
| `stock-settlement` | Live scan session / open settlement locks |
| `manual-journal`, `third-party-entry` | In-progress voucher entry |
| `barcode-printing` | Print session / label state; prefer fresh stock counts when scanning |

---

## Full registry table

Aliases (`products`→`product-dashboard`, `purchase-bills`, `purchase-returns`, `sales-report`, `purchase-report`) share the target page’s row.

| Registry path | Key stability | staleTime (typical) | gcTime (typical) | Loading branch | Verdict |
|---------------|---------------|---------------------|------------------|----------------|---------|
| `""` / `dashboard` (`Index`) | Stable `yyyy-MM` / YMD; manual refresh opts | ∞ (manual) | 30m | `isLoading` / gated metrics | **OK** |
| `pos-sales` | N/A live | live / 0 often | — | entry UI | **intentional refetch** |
| `pos-delivery-challan` | N/A live | — | — | entry UI | **intentional refetch** |
| `pos-dashboard` | YMD strings; tab-return opts | 120s | 30m | `isLoading` | **OK** |
| `sales-invoice` | entry dates local | — | — | entry UI | **intentional refetch** |
| `sales-invoice-dashboard` | Normalized range; tab-return + KPI opts | 120s / 30s | 30m | `isLoading`; bg via `isFetching && !isLoading` | **OK** |
| `quotation-entry` | entry | — | — | — | **intentional refetch** |
| `quotation-dashboard` | Filter persistence; list keys | app / tab patterns | app | `isLoading` | **OK** |
| `sale-order-entry` | entry | — | — | — | **intentional refetch** |
| `sale-order-dashboard` | Stable + `placeholderData` | app | app | `isLoading`; “refreshing…” on fetch | **OK** |
| `sale-return-entry` | entry | — | — | — | **intentional refetch** |
| `sale-returns` / `sale-return-dashboard` | List keys | app | app | `isLoading` | **OK** |
| `purchase-entry` | entry (pinned) | — | — | — | **intentional refetch** |
| `purchase-bill-dashboard` / `purchase-bills` | Normalized range; tab-return | 120s | 30m | `isLoading` | **OK** |
| `purchase-return-entry` | entry | — | — | — | **intentional refetch** |
| `purchase-return-dashboard` / `purchase-returns` | Tab-return opts | 120s | 30m | `isLoading` | **OK** |
| `product-entry` | entry | — | — | — | **intentional refetch** |
| `product-dashboard` / `products` | Tab-return / list keys | 120s | 30m | `isLoading` | **OK** |
| `customers` | Tab-return; segment keys by org | 120s / 5m segments | 30m | `isLoading` (list); chips independent | **OK** |
| `accounting/customer` | Customer-scoped history | app | app | account shell | **OK** (first-open cost separate) |
| `suppliers` | Tab-return | 120s | 30m | `isLoading` | **OK** |
| `employees` | Tab-return | 120s | 30m | `isLoading` | **OK** |
| `stock-report` | No date in key; `keepPreviousData`; 30m gc | 30s–5m | 30m | `isLoading` | **OK** |
| `reports` | Hub / nav only | — | — | — | **OK** |
| `stock-adjustment` | Tab-return lists | 120s | 30m | `isLoading` | **OK** |
| `stock-ageing` | Org key only; today for client calc | app | 30m | `isLoading` | **OK** |
| `stock-settlement` | Live session | — | — | session UI | **intentional refetch** |
| `stock-analysis` | Org / filters | app | app | `isLoading` | **OK** |
| `item-wise-sales` | Normalized day bounds in key; persist | report cache | 30m | `isLoading` | **OK** |
| `item-wise-stock` | Stock snapshot keys | app | app | `isLoading` | **OK** |
| `sales-report-by-customer` / `sales-report` | Raw `Date` in key | 5m | 30m | `isLoading` | **cache-buster** |
| `purchase-report-by-supplier` / `purchase-report` | Dates optional; when set are `Date` objects in key | 5m | 30m | `isLoading` | **OK*** (see note) |
| `price-history` | Persist filters; search keys | app | app | `isLoading` | **OK** |
| `product-tracking` | YMD **strings** in key | app | 30m | `isLoading` | **OK** |
| `daily-cashier-report` | Raw `Date` in 4 keys | 30s+ | app/30m | `isLoading` | **cache-buster** |
| `daily-tally` | Key uses `yyyy-MM-dd` string | 5m | 30m | `isLoading` | **OK** |
| `daily-sale-analysis` | IST ISO bounds in key | 60s | **5m** | `isLoading` | **OK** (gcTime = retention edge) |
| `hourly-sales-analysis` | Raw `Date`s in key | 60s | 24h | `isLoading` | **cache-buster** |
| `sales-analytics` | `dateRange` may embed mount `Date` | 60s | 24h | loading | **cache-buster** |
| `net-profit-analysis` | Imperative / string dates | — | — | local loading | **OK** |
| `einvoice-report` | Filter keys | app | app | `isLoading` | **OK** |
| `customer-ledger-report` | Report filters | app | app | `isLoading` | **OK** |
| `customer-points-report` | `isFetching && !reportData` (OK) | app | app | data-aware | **OK** |
| `customer-account-statement` | FY dates stable; **UI uses isFetching** | app | 24h | **isFetching** | **skeletons on isFetching** |
| `customer-account-statement-audit` | Period keys | app | 24h | **isFetching** | **skeletons on isFetching** |
| `customer-balance-activity` | Period keys | app | 24h | **!isFetching gate** | **skeletons on isFetching** |
| `customer-party-balances` | Org keys; quiet refresh | app | app | `isFetching && !isLoading` cue | **OK** |
| `supplier-party-balances` | Same | app | app | quiet cue | **OK** |
| `customer-audit-report` | Primary key no dates; **UI isFetching** | app | 24h | **isFetching** | **skeletons on isFetching** |
| `customer-reconciliation` | Customer-scoped | app | app | `isLoading` | **OK** |
| `stock-reconciliation` | Refresh icon spin only | app | app | `isLoading` | **OK** |
| `accounting-reports` | YMD string filters; GL **isFetching** UI | app | 24h | **isFetching** (GL tabs) | **skeletons on isFetching** |
| `expense-salary-report` | YMD strings in key | app | 24h | `isLoading` | **OK** |
| `gst-reports` | Imperative generate (not RQ mount fetch) | — | — | button `isLoading` | **OK** |
| `gst-register` | Imperative / filter driven | — | — | local | **OK** |
| `purchase-orders` | Dashboard list | app | app | `isLoading` | **OK** |
| `delivery-challan-dashboard` | List | app | app | `isLoading` | **OK** |
| `advance-booking-dashboard` | List | app | app | `isLoading` | **OK** |
| `salesman-commission` | Period → formatted date strings | app | app | `isLoading` | **OK** |
| `bulk-product-update` | Working set | app | app | `isLoading` | **OK** (heavy first-open follow-up) |
| `profile` | User/org | settings-like | app | `isLoading` | **OK** |
| `tally-export` | Imperative export | — | — | local | **OK** |
| `payments-dashboard` | Month YMD strings | tab-return-ish | app | `isLoading` | **OK** |
| `accounts` | Month YMD; tab-return | 120s | 30m | `isLoading` | **OK** |
| `accounts-payments` | Payment lists | app | app | `isLoading` | **OK** |
| `chart-of-accounts` | Org COA | app | app | `isLoading` | **OK** |
| `journal-vouchers` | List | app | app | `isLoading` | **OK** |
| `manual-journal` | Entry | — | — | entry | **intentional refetch** |
| `third-party-entry` | Entry | — | — | entry | **intentional refetch** |
| `third-party-balances` | Quiet refresh pattern | app | app | `isFetching && !isLoading` | **OK** |
| `ledger-opening-balances` | Org balances | app | app | `isLoading` | **OK** |
| `delivery-dashboard` | List | app | app | `isLoading` | **OK** |
| `barcode-printing` | Print/stock session | mixed | app | mixed | **intentional refetch** |
| `settings` | `['org-settings', orgId]`; `STALE_SETTINGS` (5m) | 5m | app 24h | settings form | **OK** (revisit blank was pane teardown, fixed by retention) |
| `audit-log` | List / filters | app | app | `isLoading` | **OK** |
| `user-rights` | Heavy admin; idle-evictable; excluded from retention | app | app | `isLoading` | **OK** (evict → remount expected) |

\* **`purchase-report`:** dates start `undefined` (stable). If the user picks dates, raw `Date` objects enter the key — same class of bug as sales-report if those dates are remounted without YMD normalization. Treat as **follow-up cache-buster** when batching date-key fixes.

---

## Negative findings

- No `Math.random()` / `Date.now()` / refresh nonce in React Query keys on registry pages.
- No `useSearchParams` object used as a cache-busting nonce (customer id in ledger keys is intentional).
- No registry-page `gcTime` &lt; 5 minutes.
- Global `keepPreviousData` + `notifyOnChangeProps` already reduce blink; pages that **read `isFetching` for full-content replacement** still regress when that prop is observed.

---

## Recommended fix batches (Phase 1+ — not this PR)

1. **Cache-busters** — normalize dates to `yyyy-MM-dd` (or day-start timestamps) before they enter `queryKey`: `DailyCashierReport`, `HourlySalesAnalysis`, `SalesReportByCustomer`, `SalesAnalyticsDashboard` (+ optional `PurchaseReportBySupplier`).
2. **`isFetching` discipline** — show cached rows; spinner only when `isLoading && !data`: Customer Ledger, Statement Audit, Balance Activity, Customer Audit Report, AccountingReports GL tabs.
3. **Shared quiet refresh bar** — `isFetching && !isLoading`, overlay, zero layout shift (one component).
4. **Do not touch** intentional-refetch entry/settlement screens.

## Test plan (for fix PRs)

- [ ] Remount (or force-evict then revisit) the four cache-buster pages within retention: instant data, no skeleton
- [ ] Same pages after retention expiry: one skeleton, then data
- [ ] Ledger / accounting-reports: background refetch keeps rows; thin indicator only
- [ ] POS / bill entry / stock-settlement: still fresh as today
- [ ] Settings ↔ Accounts ↔ Masters: no regression vs current retention behaviour
