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

### Files touched (technical detail)
- New migration: soft-delete RCP/25-26/40, RCP/26-27/139; recompute INV/25-26/314.
- New migration: `CREATE OR REPLACE FUNCTION reconcile_customer_balances(...)` with id-match rewrite, plus the new `vw_customer_ledger_anomalies` view.
- New page: `src/pages/admin/CustomerLedgerHealth.tsx`, route registration, sidebar entry under platform admin.
- No further changes to `customerAuditBundle.ts` / `customerBalanceUtils.ts` (already done in Phase 1).
