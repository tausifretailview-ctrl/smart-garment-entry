# Slowness & loading fix — what this plan will actually solve

You asked: *"after this plan is approved, what problems get solved, and confirm nothing in existing structure / logic will break."* Below is exactly that — no scope creep, no UI / business-logic change.

---

## Problems that will be solved

### 1. Silent DB error on every purchase-return / supplier-CN screen (HIGH IMPACT)

**What's happening today:** Postgres is logging this error repeatedly:

```
ERROR: column purchase_returns.credit_available_balance does not exist
```

The column is missing in the live database, but **8 source files still query / write it**:
`src/utils/supplierBalanceUtils.ts`, `src/utils/purchaseReturnCnDisplay.ts`,
`src/pages/PurchaseReturnEntry.tsx`, `src/pages/PurchaseReturnDashboard.tsx`,
`src/components/SupplierLedger.tsx`, `src/components/AdjustCreditNoteDialog.tsx`,
`src/components/accounts/SupplierPaymentTab.tsx`, `src/utils/accounting/tallyV2JournalPosters.ts`.

**Visible symptoms users have been reporting:**
- Purchase Return Dashboard / Entry — slow, blank rows, "supplier CN" amount shows wrong
- Supplier Ledger — CN balance mismatched, sometimes spinner
- Adjust Credit Note dialog (supplier side) — stale numbers
- Tally Export & GST Sale/Purchase Register — silent partial data
- Accounts → Supplier Payment tab — wrong outstanding

**Fix:** New idempotent migration that re-adds the column (`ADD COLUMN IF NOT EXISTS`) and backfills `credit_available_balance = net_amount` for pending rows — exactly what the original migration `20260510120001` was supposed to do. **No table renamed, no other column touched, no RLS change, no trigger change to business-logic tables.**

### 2. "Taking longer than expected — Retry tab / Refresh app" screen (the WhatsApp screenshot)

**What's happening today:** `src/components/TabCachedPages.tsx` flips to that screen after **8 seconds** of chunk-loading. Only 4 tabs currently get the longer 20-second budget. Pages bigger than those are NOT marked heavy, so on Windows desktop / slow connections they trip the timeout:

| Page | Source size | Currently heavy? |
|---|---:|---|
| POSSales | 293 KB | ❌ |
| BarcodePrinting | 260 KB | ✅ |
| Settings | 257 KB | ✅ |
| PurchaseEntry | 223 KB | ❌ |
| SalesInvoiceDashboard | 200 KB | ❌ |
| SalesInvoice | 198 KB | ❌ |
| POSDashboard | 184 KB | ❌ |
| ProductEntry | 133 KB | ❌ |

**Fix:** add these tabs to `HEAVY_TAB_PATHS` so they get 20 s instead of 8 s. Pure list change — **no print, no search, no save, no UI changed**.

### 3. Cold-load lag on Barcode Printing

`barcode-printing` (260 KB) is not in `POST_LOGIN_IDLE_PREFETCH_TAB_PATHS`. Add it so the chunk warms in the background after login. No behavior change.

### 4. Cloud usage / cost — concrete control

`src/hooks/useCloudUsageEstimate.tsx` and the dashboard cause repeat counting queries on every visit. After fix #1 ships I'll do a **read-only** audit (one report file, no code change) of:
- top expensive PostgREST calls (last 7 days from `postgres_logs`)
- pages that refetch on every tab switch
- pages without `useVisibilityRefetch`

Then propose a tiny second plan with only stale-time / interval changes (no logic change). That keeps the risky touches out of *this* plan.

### 5. Recent cursor-github merges (last 3 days)

I checked the 30 most-recent commits (POSDashboard, POSSales, SalesInvoice, BarcodePrinting, PurchaseEntry, SaleReturnEntry). **None of them re-introduced the missing `credit_available_balance` column** — that gap is pre-existing. The recent merges are exercising the broken queries more often, which is why pain spiked the last 3 days. No merge needs to be reverted.

---

## What this plan will NOT touch (guarantee)

- ❌ RLS policies, security policies, role checks
- ❌ Customer / supplier balance formulas, reconciliation RPCs
- ❌ Sale / Purchase / Return / POS save logic
- ❌ Bill print, thermal print, A5/A4 invoice template, e-invoice
- ❌ Barcode print template, QZ Tray flow, label dimensions
- ❌ Search dropdowns, multi-token search, variant search, POS barcode lookup
- ❌ UI design, colors, layout, dashboards, mobile screens
- ❌ Auto-generated files: `src/integrations/supabase/client.ts`, `types.ts`, `.env`, `supabase/config.toml`
- ❌ Any existing migration file (only a new timestamped one is added)

## Files that will change (Phase 1 only — total 3 files)

1. **New migration** `supabase/migrations/2026xxxx_restore_purchase_returns_credit_available_balance.sql` — single `ADD COLUMN IF NOT EXISTS` + backfill + comment. ~15 lines.
2. **`src/components/TabCachedPages.tsx`** — add 6 tab paths to the `HEAVY_TAB_PATHS` array. ~6 lines.
3. **`src/lib/chunkLoadRetry.ts`** — add `"barcode-printing"` to `POST_LOGIN_IDLE_PREFETCH_TAB_PATHS`. 1 line.

That is the entire change set for Phase 1.

## Verification I will run after applying

- `supabase--analytics_query` on `postgres_logs` → the `credit_available_balance` ERROR should disappear within minutes.
- Open Purchase Return Dashboard, Supplier Ledger, Adjust Credit Note dialog, Tally Export → no error, numbers correct.
- Open POS Dashboard / Sales Invoice Dashboard / Purchase Entry on a slow connection → no "Taking longer than expected" screen.
- Build passes (already automatic after edits).

## Phase 2 (separate plan, only after Phase 1 confirmed good)

- Cloud usage audit report (read-only)
- Stale-time tuning on hot dashboards
- POS Dashboard `fetchSales` debounce on tab return (already documented in `docs/app-loading-slowness-diagnosis.md` and `CURSOR_PROMPT_PERF.md`)
- DB linter security warnings (296 items, all WARN level — batch in groups, behind feature flag-style migrations so any one can be reverted)

I will not start Phase 2 until you approve Phase 1 and confirm production is stable.
