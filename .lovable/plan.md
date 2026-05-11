## Verification results (DB audit, just now)

### A. SHEHNAZ HALAI — ELLA NOOR
- Customer id `a7b7e39c…0234e`, opening **₹42,310**.
- 10 active sales, gross **₹1,93,800**; `sales.paid_amount` sum **₹1,13,190**.
- Voucher receipts pointing at her sale ids:
  | reference_type | payment_method | rows | amount |
  |---|---|---:|---:|
  | customer | advance_adjustment | 7 | **₹60,950** ← mis-tagged |
  | customer | cash               | 1 | **₹41,750** ← mis-tagged |
  | sale     | advance_adjustment | 1 | ₹10,490 |
- Customer-keyed opening receipts: **0**.
- `customer_advances`: received ₹1,46,950, `used_amount` = ₹1,13,190 (drift +₹41,750 — equals the mis-tagged cash receipt).
- `customer_balance_adjustments`: -₹8,550.
- `reconcile_customer_balances` RPC reports `total_cash_payments = 0`, `calculated_balance = ₹1,14,370` — **wrong**. The RPC is not picking up the 8 mis-tagged rows.

After Phase 1.1+1.2 the front-end (`useCustomerBalance` → `fetchCustomerAuditBundle`) now reads all 9 sale-id-matched receipts. Expected on-screen balance ≈ **₹38,860 Dr** (42,310 + 1,93,800 − 41,750 cash − 1,13,190 adv-used − 33,760 unused − 8,550 adj). User should reload Customer Ledger / Customer Account Statement for SHEHNAZ HALAI and confirm.

### B. MAULI FOOTWEAR-BORIVALI E — KS FOOTWEAR
- Customer id `5008c42e…ac011`, opening **0**.
- 19 sales, gross **₹54,420.38**; `sales.paid_amount` sum **₹28,095.45**.
- 20 receipt rows total. Two are garbage and match the prior audit:
  - **RCP/25-26/40** — ref_type=`customer`, ref_id=customer, ₹2,610.66, description "4". Orphan / not matching any bill.
  - **RCP/26-27/139** — ref_type=`sale`, ref_id=INV/25-26/314, ₹2,611, dated 11-May-26. Duplicate of **RCP/25-26/132** for the same bill on 01-Feb-26.
- 6 mis-tagged sale-linked receipts (`reference_type='customer'`, total ≈ ₹16,208).
- RPC reports `calculated_balance = -₹3,219.11` (overpaid) — caused by orphan + duplicate above.

After Phase 1.1+1.2 the front-end captures the mis-tagged rows. The orphan and duplicate still need a one-row migration.

---

## Plan

### Step 1 — User verification (before any DB write)
Ask the user to open in the live app:
1. Customer Ledger → SHEHNAZ HALAI (ELLA NOOR). Expected closing **≈ ₹38,860 Dr**.
2. Customer Ledger → MAULI FOOTWEAR-BORIVALI E (KS FOOTWEAR). Pre-cleanup expected ≈ **−₹3,219 Cr** (over-paid by orphan+duplicate).

If both screens show those numbers, the Phase 1.1+1.2 read-path fixes are confirmed working. We can then proceed.

### Step 2 — Targeted MAULI cleanup (one migration)
Soft-delete the two problem rows and recompute the affected sale:
- `voucher_entries`: set `deleted_at = now()`, `deleted_by = system` for `RCP/25-26/40` and `RCP/26-27/139` (org-scoped, IF EXISTS guarded).
- `sales`: recompute `paid_amount` = sum of remaining non-deleted receipts for `INV/25-26/314`; recompute `payment_status`.
- Expected MAULI closing after cleanup: **≈ ₹2,003 Dr** (only INV/26-27/350 outstanding).

### Step 3 — Fix `reconcile_customer_balances` RPC (one migration)
Rewrite the RPC's cash-payment and opening-balance CTEs to use **id-match against `sales.id`** (the rule already documented in `mem://features/accounts/customer-balance-logic`). This stops mis-tagged rows from disappearing on every page that uses the RPC (CustomerReconciliation, server-side health checks).

After the rewrite, `total_cash_payments` for SHEHNAZ HALAI must be ≥ ₹41,750, and `calculated_balance` must match the front-end's computed balance within ₹1.

### Step 4 — Build "Customer Ledger Health" diagnostic page (the original Phase 2 deliverable)
- New route `/admin/customer-ledger-health` (platform-admin only).
- New SQL view `vw_customer_ledger_anomalies` with per-org counts/amounts for the 5 defect classes already enumerated in the org-wide audit (mis-tagged receipts, paid_amount drift, duplicates, ghosts, NULL refs).
- UI: table of orgs, per-org counts, drill-down to per-customer rows. Read-only — no fix buttons here (those go in Phase 4 historical repairs).
- Smoke-test against MAULI (drift should be 0 after Step 2) and SHEHNAZ HALAI (mis-tagged count should now be 0 after the RPC fix in Step 3, since the rows are no longer "invisible").

### Step 5 — Verification before closing Phase 2
- SHEHNAZ HALAI ledger balance matches between Customer Ledger UI, Customer Account Statement, CustomerReconciliation page, and the new health view.
- MAULI FOOTWEAR ledger shows ₹2,003 Dr in all three places.
- Health page shows reduced anomaly counts org-wide vs. the snapshot taken before Step 2.

### Out of scope for Phase 2 (queued for Phase 3 / 4)
- The `customer_advances.used_amount` drift on SHEHNAZ HALAI (+₹41,750) — write-side bug, fix lives in Phase 3 hardening.
- Org-wide bulk relabel of the 1,748 mis-tagged rows and 18,948 drifted sales — Phase 4 historical repair.
- Write-side guards (CHECK / triggers preventing future mis-tags) — Phase 3.

---

## Phase 3 — Write-side hardening (DONE)

Migration `20260511_phase3_customer_ledger_hardening` applied:

1. **`trg_normalize_voucher_reference_type`** (BEFORE INSERT/UPDATE on `voucher_entries`) — auto-rewrites `reference_type='customer'` to `'sale'` when `reference_id` matches `sales.id`. Future writes from POS exchange refunds (`useSaveSale`), Payments dashboard, Bulk advance adjust, and sale-return refunds can no longer create mis-tagged rows.
2. **`recompute_customer_advances_used(org, customer)`** + **`trg_sync_customer_advances_used`** (AFTER INSERT/UPDATE/DELETE on `voucher_entries`) — keeps `customer_advances.used_amount` and `status` (active/partially_used/used) in sync FIFO whenever an `advance_adjustment` receipt changes. Handles both sale-linked and customer-keyed advance receipts.
3. **One-shot backfill** — relabeled 1,749 mis-tagged rows; recomputed `used_amount` for every customer with advances.

### Verification
- Mis-tagged rows: **1,749 → 0** ✅
- Customers with `used_amount` drift > ₹1: **70 → 2** (₹3,64,785 → ₹8,500) ✅
- 14 orphan `reference_type='customer'` rows (no sale, no customer match) remain — Phase 4 cleanup.
- 2 residual drift customers (ELLA NOOR / SANOBER ₹500, Naseem Jahid −₹8,000) are real legacy data issues, not algorithm bugs:
  - SANOBER: receipts attributed to a sale whose `customer_id` ≠ advance's `customer_id`.
  - Naseem Jahid: ₹26,800 in advance-funded receipts but only ₹18,800 in `customer_advances.amount` — over-consumption capped by recompute.
  Both flagged for Phase 4 manual review.

### Out of scope for Phase 3 (queued for Phase 4)
- 14 orphan voucher rows (no matching sale or customer).
- 2 residual advance over-consumption customers (data correction, not code).
- Sale `paid_amount` drift recomputation across the org.

---

## Phase 4 — Historical receipt backfill (DONE)

Strategy chosen: **Orphans + backfill missing receipts** (preserve `sales.paid_amount` as the authoritative figure; treat missing voucher rows as the bug).

1. Soft-deleted **5 truly orphan** receipt voucher_entries (RCP/25-26/1369, VCH/25-26/13, RCP/25-26/1412, RCP/25-26/11, RCP/25-26/34) — `reference_id` matched neither a sale nor a customer.
2. Inserted **20,015 backfill receipts** (`voucher_number = 'BCK/<sale-id>/<hash>'`, `reference_type='sale'`) for legacy POS sales where `sales.paid_amount` exceeded the existing voucher receipt sum by > Re 1. Each backfill uses `sale_date` and the sale's `payment_method` (default `cash`).

### Verification
- Orphan voucher rows: **5 → 0** ✅
- Sales over-paid (paid_amount > voucher_sum): **20,015 → 0** ✅
- Sales under-paid (voucher_sum > paid_amount): **722** — intentionally deferred. These are likely duplicate or over-collected receipts; need per-row human review, not blanket recompute.

### Out of scope (queued for Phase 5 if needed)
- 722 under-paid sales — case-by-case audit per org via the Ledger Health page.
- Orphan customer-keyed voucher rows in legacy data outside the receipt voucher_type (none currently flagged).

### Files touched (technical detail)
- New migration: soft-delete RCP/25-26/40, RCP/26-27/139; recompute INV/25-26/314.
- New migration: `CREATE OR REPLACE FUNCTION reconcile_customer_balances(...)` with id-match rewrite, plus the new `vw_customer_ledger_anomalies` view.
- New page: `src/pages/admin/CustomerLedgerHealth.tsx`, route registration, sidebar entry under platform admin.
- No further changes to `customerAuditBundle.ts` / `customerBalanceUtils.ts` (already done in Phase 1).
