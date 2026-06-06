## Scope

Audit two coupled subsystems and produce a fix list. NO code changes will be made in this plan — only findings + a proposed remediation roadmap to approve.

1. **`sales.payment_status` / `paid_amount` sync** — what writes these fields, where they drift, and where the canonical formula is violated.
2. **`reconcile_customer_balances` RPC** — whether its per-customer `calculated_balance` truly matches the Customer Ledger figure on screen, and what causes residual mismatch.

---

## A. Payment-status / paid_amount sync — findings

### A1. Two writers exist, not one
- DB trigger `trg_sync_sale_payment_status_from_receipts` → `compute_sale_settlement(sale_id, org_id)` (migration `20260708...`). Sole DB-side writer driven by `voucher_entries` insert/update/delete.
- Client helper `derivePaidAndStatus` in `src/utils/saleSettlement.ts`. Called inline at sale save/edit and POS settlement.
- **They use different formulas.** This is the root drift source.

| Rule | DB `compute_sale_settlement` | Client `derivePaidAndStatus` |
|---|---|---|
| Payable cap | `net_amount` (post-adjust) | `net_amount` (post-adjust) ✅ same |
| CN dedupe | `genuine_cn = max(0, cn − sra)` | not modeled (caller passes `cnApplied` directly) |
| Tender vs receipts | `paid = min(cap, max(receipts, tender))` when tender > receipts | `paid = cash + adv + cn + discount` |
| Completed threshold | `paid >= cap − 1` (₹1) | `total >= net − 0.5` (₹0.50 `SETTLEMENT_TOLERANCE`) |
| Pay-later 0/0 | not special-cased here (relies on `enforce_pay_later_zero_paid`) | `paymentMethod === 'pay_later'` → `pending` |

Consequences:
- Edits saved by the client can flip status one way; a later voucher insert flips it back via the trigger.
- The ₹1 vs ₹0.50 threshold gap causes invoices ₹0.51–₹1.00 short to appear `completed` from DB but `partial` from the client.
- The CN-dedupe rule lives ONLY in the DB; client save paths that pass `cnApplied` without subtracting `sale_return_adjust` overstate `paid_amount`.

### A2. `enforce_pay_later_zero_paid` reference-type gap (known landmine)
- Trigger still checks only `('sale','SALE','CustomerReceipt')`. Missing `'customer'` and `'customer_payment'` (the canonical `CUSTOMER_RECEIPT_REFERENCE_TYPE_VALUES`).
- A pay-later sale paid via a customer-keyed receipt can be force-zeroed back to `pending`, contradicting `compute_sale_settlement` which DOES include `reference_type='customer'`. This is exactly the "stuck Not Paid" class of bug.

### A3. `paid_at` drift (POS tender vs voucher)
- `20260615...` introduced paid_at drift handling; `20260803200000...` narrowed it to "only when cash/card/upi tender exists" so advance-only payments don't double count.
- `compute_sale_settlement` already reflects this: `LEAST(cap, GREATEST(receipts, tender))`. Good.
- But the **client** `derivePaidAndStatus` does not see `tender` separately — it accepts whatever the caller passes as `cashReceived`. POS edit flows that don't reset `cash_amount` correctly can produce `paid_amount > receipts`, which then survives until the next voucher event re-triggers the DB recompute.

### A4. `recomputeSalePaymentState` referenced in invariants but does not exist
- `.cursor/rules/backend-core-invariants.mdc` and `payment-stock-landmines.mdc` explicitly note this. Confirmed: no such file in `src/utils/`. The single source of truth helper is the planned consolidation point — until it ships, every new write path is a drift risk.

---

## B. `reconcile_customer_balances` correctness — findings

Current definition (migration `20260803120100...`):

`calculated_balance = get_customer_true_outstanding(customer_id, org_id)`

The CTE columns `total_invoices / total_cash_payments / total_advances / ...` are display-only; they DO NOT feed `calculated_balance`. So the master figure is whatever `get_customer_true_outstanding` returns.

### B1. Two parallel formulas, neither is fully the other
- `get_customer_true_outstanding` (DB) — used by reconcile RPC and the Customer Reconciliation page.
- `computeCustomerBalanceCore` (TS, `src/utils/customerBalanceCore.ts`) wrapped by `computeCustomerOutstanding` — used by `useCustomerBalance`, `CustomerLedger.tsx`, `fetchCustomerBalanceSnapshot`.
- `computeCustomerOutstanding` internally also runs `computeCustomerOutstandingLegacy` and `warnCustomerBalanceMismatch` on ₹>1 drift — meaning a third path still exists and is actively compared.
- `customerAuditMath.ts` is a fourth variant (audit screens). Already flagged in the rules as a known drift risk.

A customer who shows ₹X on the Customer Ledger and ₹Y on Customer Reconciliation has either (a) `core` vs `true_outstanding` drift, (b) `core` vs `legacy` drift, or (c) snapshot lag (`useCustomerBalance` uses `STALE_FREQUENT`).

### B2. CTE display vs `calculated_balance` mismatch in the RPC
- The CTE computes `total_cash_payments` excluding `payment_method IN ('advance_adjustment','credit_note_adjustment')` AND description LIKE filters.
- `total_invoices` is **gated gross** (`net_amount + sale_return_adjust`, dropped when post-return).
- But `calculated_balance` ignores all of the above and calls `get_customer_true_outstanding`.
- Result: a user reading the row sees columns that don't add up to the balance — e.g. invoices 100k, payments 80k, but balance shows 25k because `get_customer_true_outstanding` uses different gates.
- Treating the row arithmetically is a foot-gun; the "Customer Reconciliation" UI must clearly label this or recompute display columns from the same primitives that drive `get_customer_true_outstanding`.

### B3. Opening-balance receipts vs sale-linked receipts
- `open_pay` CTE includes `reference_type IN ('customer','customer_payment','CustomerReceipt')` AND `NOT EXISTS(sale with id = reference_id)`.
- `cash_pay` CTE joins `sales s ON s.id = ve.reference_id` regardless of `reference_type` — correctly captures legacy `reference_type='customer'` rows that point at a sale.
- BUT: the `cash_pay` CTE filters `s.deleted_at IS NULL` only. A receipt where `reference_id` happens to equal both a (different) deleted sale id and a real customer id will be misclassified. Edge case; needs verification.

### B4. `sales.payment_status NOT IN ('cancelled','hold')` gate is missing on returns/advances/refunds
- `inv` CTE filters cancelled/hold ✅
- `ret`, `adv`, `adv_ref`, `ref_vouch` do NOT — but `get_customer_true_outstanding` may. This means the display column `total_sale_returns` includes returns tied to cancelled invoices, while `calculated_balance` doesn't.

### B5. `total_invoices` "post-return" gate is heuristic
- Drops `sale_return_adjust` when `net + sra > items_gross + 1`. This is a proxy for "the return was already applied at billing". On older datasets with edited MRPs or imported gross values, the gate misfires both directions. The TS counterpart in `computeCustomerBalanceCore` uses the same proxy, so they stay aligned — but neither is provably correct for migrated data.

---

## C. Proposed remediation

### C1. Build the single source of truth helper (closes A1, A3, A4)
- Create `src/utils/recomputeSalePaymentState.ts` that wraps a **single** rule shared with `compute_sale_settlement`:
  - input: `saleId`, `organizationId`
  - reads net/sra/tender + receipt buckets via one SQL call
  - returns `{ paidAmount, paymentStatus }`
  - tolerance: standardize on `SETTLEMENT_TOLERANCE = 0.5` (drop the ₹1 in DB; trigger should call the same threshold)
- Migrate all callers off `derivePaidAndStatus`-with-inline-args; keep the pure function but have it use the same threshold and CN-dedupe.
- Migration: align `compute_sale_settlement` completed threshold to `0.5` and add explicit `pay_later AND paid=0 AND sra=0 → pending` short-circuit so DB matches client.

### C2. Widen `enforce_pay_later_zero_paid` reference_type set (closes A2)
- New migration: replace hardcoded `('sale','SALE','CustomerReceipt')` with the canonical `('sale','SALE','customer','customer_payment','CustomerReceipt')`.
- Add a regression test row in `scripts/` (assert: pay-later sale + `reference_type='customer'` receipt stays `partial`/`completed`).

### C3. Make `reconcile_customer_balances` self-consistent (closes B1, B2, B4)
- Recompute the CTE display columns from the **same primitives** that `get_customer_true_outstanding` uses (or have `get_customer_true_outstanding` return a breakdown jsonb and use it for both `calculated_balance` AND the display columns).
- Add `payment_status NOT IN ('cancelled','hold')` and `deleted_at IS NULL` on `ret`, `adv_ref`, `ref_vouch` CTEs to match `inv`.

### C4. Converge `computeCustomerBalanceCore` and `get_customer_true_outstanding` (closes B1)
- Write a one-shot audit script `scripts/audit-balance-formula-parity.sql` that, for every customer in an org, asserts `|core − true_outstanding| ≤ 1`.
- Drift > ₹1 → log row; we patch whichever side is wrong (currently the legacy `computeCustomerOutstandingLegacy` warns on >₹1 — extend that to also compare against `true_outstanding`).
- Once parity is clean, delete `computeCustomerOutstandingLegacy` and the duplicate in `customerAuditMath.ts`.

### C5. Recipe to verify "exact customer balance"
- Pick the customer being investigated.
- Run `reconcile_customer_balance(customer_id, org_id)` (singular RPC — returns the row-by-row breakdown).
- Compare line-by-line with the Customer Ledger page totals (Gross sales, S/R on invoices, Receipts, Advances, Pending returns, Adjustments).
- Any line that differs → identifies which CTE / which TS bucket needs the fix.

---

## Order of execution (if approved)

```text
1. C2  widen enforce_pay_later_zero_paid             (1 migration, low risk)
2. C5  document the verification recipe in /docs     (no code)
3. C3  reconcile RPC self-consistency                (1 migration)
4. C1  recomputeSalePaymentState single SoT          (1 ts file + 1 migration to align thresholds)
5. C4  formula parity audit + legacy removal         (script + ts cleanup)
```

Each step is independently shippable and independently testable per-org before rollout.

## Out of scope

- Customer Ledger UI redesign.
- Voucher numbering / atomic generation (already covered by `generate_voucher_number`).
- Sale-return CN balance logic (Phase 2 already shipped per `customer-balance-logic` memory).