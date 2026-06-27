# Cloud Usage Audit — 2026-06-27 (Phase B Findings)

Read-only audit. **No code changed.** Awaiting your approval before Phase C batches.

Source signals:
- `pg_stat_statements` top 30 (Postgres, current rolling window)
- Codebase grep: `supabase.channel`, `refetchInterval`, `setInterval`, `staleTime`, `supabase.functions.invoke`, `useQuery`
- `pg_indexes` introspection for trigram coverage

---

## 1. Page-level summary table

Reads per visit, derived from code inspection (each item = 1 Supabase REST/RPC call unless noted). Pages already on the **excluded list** are marked ✅ DONE.

| Page | Mount reads | Tab-return reads | Per keystroke | Polling | Status |
|---|---|---|---|---|---|
| Sales Dashboard | — | 0 | trigram | — | ✅ DONE |
| Accounts Management | 1 RPC | 0 | debounced client-side | — | ✅ DONE |
| Settings | deferred | 0 | n/a | — | ✅ DONE |
| Sale Order Dashboard | narrowed | 0 | trigram | — | ✅ DONE |
| Product Master | paginated RPC | 0 | RPC search | — | ✅ DONE |
| Stock Report | RPC in flight | — | — | — | 🟡 in progress |
| Main Dashboard | RPCs in flight | — | — | — | 🟡 in progress |
| **StatusBar (global)** | 2 (stock + receivables) | refetches every 10s of activity | — | implicit via `STALE_FREQUENT` | ⚠️ NEW |
| **POS Sales** | ~6 (cart, customer, settings, holds, templates) | 0 (tab cached) | barcode trigram OK | F-key trigger only | OK |
| **Sales Invoice (entry)** | ~7 | 0 | customer search trigram OK | — | OK |
| **Purchase Bill Dashboard** | 1 list + N count (LATERAL) | 0 | trigram | — | 🟡 in progress (excluded) |
| **Purchase Entry** | ~5 | 0 | trigram | — | OK |
| **Customer Master** | 1 paginated | 0 | trigram | — | ⚠️ wide SELECT — see #F4 |
| **Inventory / Product Dashboard** | server-paged | 0 | RPC | — | ✅ DONE |
| **Item-Wise Sales Report** | heavy (full variant scan) | — | — | — | ⚠️ NEW (see #F6) |
| **Daily Sale Analysis** | full sales+items pull | refetch every 30 min if today | — | 30 min poll | OK |
| **Daily Cashier Report** | staleTime 0 | refetch every nav | — | — | ⚠️ minor (see #F7) |
| **Customer Reconciliation** | 2× staleTime 0 | refetch every nav | — | — | ⚠️ minor (see #F7) |
| **Floating POS Reports** | on open | — | — | 10 min poll while open | OK |
| **Floating WhatsApp Inbox** | 1 unread count | 0 | — | realtime only | OK |
| **WhatsApp Inbox page** | 2 lists | 0 (realtime) | — | realtime only | OK |
| **Owner / Mobile Dashboard** | RPC | refetchInterval false ✓ | — | — | OK |
| **GST Reports / E-Invoice Report** | on action | — | — | — | OK |
| **Public Invoice View** | staleTime 0 | — | — | — | OK (public link, low traffic) |

Edge functions: every `supabase.functions.invoke` call site is **on-demand** (Save, Send WhatsApp, Generate E-Invoice, Reset, Backup, Admin actions). **No edge function fires on page mount.** ✅

---

## 2. Top hotspots (new, ranked by total_ms)

Excludes already-fixed sale_items / purchase_items / sales ILIKE, narrowed SELECTs, and items explicitly in progress (purchase_bills N+1, voucher_entries 12-OR, fetchSaleReceiptSplitsForInvoices).

| # | Query | Calls | Mean | Total | Root cause | Fix idea | Risk | Est. saving |
|---|---|---:|---:|---:|---|---|---|---|
| F1 | `sale_items + sales` LATERAL join (sale_id list) — `fetchSaleItemsByOrg` style | 1,333 | 175 ms | 234 s | LATERAL re-evaluates per parent row; embed pattern; large IN list | Switch to single `IN ($sale_ids)` query + client-side `Map.group` (drop the LATERAL `sales` re-join — caller already has org scope) | LOW | ~3.5 min/wk |
| F2 | `v_dashboard_stock_summary` from StatusBar | 3,251 | 23 ms | 77 s | `STALE_FREQUENT` (10 s) on a global footer that mounts everywhere. Each multi-tab session burns thousands of reads | Raise StatusBar query to `STALE_REFERENCE` (2 min) or `STALE_SETTINGS` (5 min) + invalidate on sale/receipt save | LOW | ~1.3 min/wk + many cloud reads |
| F3 | `products` with `product_variants` + `size_groups` embed (Settings? Brand mgmt?) | 35 | 2,616 ms | 92 s | Full org-wide product+variants embed in one call; LATERAL `json_agg` per product | Locate caller (likely a master-data screen pre-RPC), paginate or replace with `get_product_catalog_page` | MED | ~1.5 min/wk |
| F4 | `customers SELECT *` paginated (no ILIKE) | 4,730 | 19 ms | 89 s | Customer Master fetches all 22 columns; only 9 are shown in list | Narrow SELECT to id, customer_name, phone, email, gst_number, opening_balance, points_balance, discount_percent | LOW | ~1.5 min/wk + bandwidth |
| F5 | `products` full org list with 6-col ILIKE (Inventory search) | 3,789 | 18 ms | 69 s | Already trigram-indexed; high call volume = no debounce or per-keystroke fire | Confirm 250 ms debounce on Inventory search box (and Product Master if not on RPC path) | LOW | ~1 min/wk |
| F6 | `product_variants SELECT *` no org filter (RLS-only scan) | 22 | 2,760 ms | 61 s | Caller forgot `.eq('organization_id', …)` — RLS scans whole table | Find caller (Item-Wise Sales / NetProfit / Settings cohort), add explicit `organization_id` filter | LOW | ~1 min/wk + RLS pressure |
| F7 | `customer_product_prices SELECT *` no filter | 29 | 2,117 ms | 61 s | Same pattern — RLS scan | Audit callers; add `organization_id` filter | LOW | ~1 min/wk |
| F8 | `customers ILIKE` with `count` | 853 | 64 ms | 54 s | `{count:'exact'}` on every paginated list call doubles plan cost | Switch to `{count:'planned'}` (or 'estimated') on Customer Master pagination | LOW | ~0.5 min/wk |
| F9 | `product_variants` ILIKE with embed (POS variant lookup older path) | 912 | 93 ms | 85 s | Older PoS lookup path still hot | Verify all callers use the new `lookupBarcodeStock` indexed path | MED | ~1 min/wk |
| F10 | UPDATE `purchase_items.mrp` (one-row fill-missing) | 1,000 | 149 ms | 149 s | Looks like the `fixMissingMrp` repair loop firing 1 row at a time | Batch via single `UPDATE ... WHERE id = ANY ($ids) AND mrp IS NULL` | LOW | ~2.5 min/wk |

Excluded by your instructions: Rank 2 (purchase_bills LATERAL count), Rank 4 (voucher_entries 12-OR).

---

## 3. React Query audit

- **Global default** in `App.tsx`: `staleTime: 30_000`, `refetchOnWindowFocus: false`, `retry: 1`. Good baseline.
- **`staleTime: 0` occurrences (7 total):**
  - `AdjustCustomerCreditNoteDialog.tsx`, `AdjustCreditNoteDialog.tsx`, `InvoiceHistoryDialog.tsx` — dialog open = fresh data, **legitimate**.
  - `DailyCashierReport.tsx` — full-day live report, **borderline**: switch to 30 s tier; user manually refreshes anyway.
  - `CustomerReconciliation.tsx` (×2) — drift audit screen, **borderline**: 30 s tier is safe; runs on demand.
  - `PublicInvoiceView.tsx` — public link, low traffic, leave as-is.
- **No list-page query** in the codebase uses `staleTime < 30_000` outside the live-search keys handled by `staleTimeForQueryKey`.
- **No `useQuery` found inside list-row components** (no N-row useQuery fan-out detected). ✅
- **StatusBar** uses `STALE_FREQUENT` (10 s) and renders on every page — biggest unintended polling source (see F2).

---

## 4. Realtime channels

| Channel | Filter (server-side?) | Verdict |
|---|---|---|
| `whatsapp-unread-${org.id}` (`FloatingWhatsAppInbox`) | `filter: organization_id=eq.${org.id}` | ✅ Server-scoped |
| `whatsapp-notify-${org.id}` (`WhatsAppMessageNotifier`) | `filter: organization_id=eq.${org.id}` | ✅ Server-scoped |
| `whatsapp-updates-${org.id}` (`WhatsAppInbox` page) | `filter: organization_id=eq.${org.id}` | ✅ Server-scoped |
| `user-permissions-${user}-${org}` (`useUserPermissions`) | `filter: user_id=eq.${userId}` | ✅ Server-scoped (per-user) |

**No HIGH-priority realtime finding.** No channel leaks cross-tenant events.

---

## 5. Polling audit

| Site | Interval | Verdict |
|---|---|---|
| `DailySaleAnalysis` | 30 min if today | OK |
| `FloatingPOSReports` | 10 min while open | OK |
| `TabletPOSLayout` clock | UI only | OK |
| `POSSales` cart auto-save + hold poll | local + on action | OK |
| `AuthContext` periodic token check | session, not DB | OK |
| `ElectronWebUpdatePrompt` | desktop only | OK |
| All mobile dashboards | `refetchInterval: false` ✓ | OK |
| `useTierBasedRefresh` (free tier) | disabled | OK |
| **StatusBar** (implicit via stale time) | ~10 s effective | ⚠️ see F2 |

---

## 6. Edge functions

No edge function is invoked on page mount. All 30+ invoke sites are bound to user actions (Save, Send, Generate, Reset, Admin). Edge function frequency is therefore driven by business activity, not cloud waste. ✅

(No `pg_stat` for edge-function HTTP frequency is exposed in this audit; recommend checking `function_edge_logs` if you need per-function call counts.)

---

## 7. Proposed Phase C batches (for your approval — one at a time)

**Batch C1 — LOW risk, biggest reads-saved-per-line-changed**
- F2: Raise StatusBar `staleTime` to `STALE_REFERENCE` (2 min), invalidate on sale save / receipt save.
- F4: Narrow Customer Master list SELECT to displayed columns.
- F8: Switch Customer Master pagination count to `planned`.
- F1 (partial): Drop the inner LATERAL `sales` join from `fetchSaleItemsByOrg` callers when org scope is already known.

**Batch C2 — LOW risk, correctness + cost**
- F6 + F7: Add missing `organization_id` filter to the unfiltered `product_variants` and `customer_product_prices` queries (find caller, patch).
- F10: Batch the `fixMissingMrp` UPDATE loop into one statement.

**Batch C3 — MED risk, isolated paths**
- F3: Locate the 2.6 s `products + variants + size_groups` embed caller and route through `get_product_catalog_page` or paginate.
- F9: Audit POS variant-lookup paths to ensure all callers use the indexed `lookupBarcodeStock`.

**Batch C4 — Optional minor cleanups**
- F5: Confirm 250 ms debounce on Inventory and Product Master search boxes (verify before changing).
- DailyCashierReport / CustomerReconciliation: lift `staleTime: 0` to default 30 s on the audit tables.

---

## 8. What's already optimal (do not retouch)

- All 4 realtime channels are server-side org-scoped.
- Tab-return guards (`DASHBOARD_TAB_RETURN_QUERY_OPTIONS`) cover Sales / Purchase / Product dashboards.
- Mobile dashboards all set `refetchInterval: false`.
- Free-tier orgs have polling fully disabled (`useTierBasedRefresh`).
- No edge function fires on mount.
- `App.tsx` defaults are conservative (30 s stale, no focus refetch, retry 1).

---

**Awaiting your approval to proceed with Batch C1.** No code changes will be made until you confirm which batch(es) and any constraints.