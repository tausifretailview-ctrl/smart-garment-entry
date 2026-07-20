## Problem Recap (Madiha Nursumar pattern)

Root cause of the recurring mismatch:

- **Balance Adjustment dialog** writes a *net delta* into `customer_balance_adjustments` + a single `customer_ledger_entries` row.
- It does **NOT** create `voucher_entries` of type `receipt` allocated to specific invoices / opening balance.
- Result: ledger closing balance is correct, but:
  - Sales Invoice Dashboard shows invoices as `Not Paid` / `Partial`.
  - Customer Payment tab shows Opening Balance as unpaid.
  - Any downstream FIFO / receipt-based logic ignores the adjustment.

Every time staff "fixes" a balance via the Adjustment dialog instead of the Customer Payment dialog, the same drift will reappear.

---

## Proposed Solution — 3 layers

### Layer 1 — Prevention (fix at source)

Change `CustomerBalanceAdjustmentDialog` so a REDUCE / SETTLE adjustment cannot exist as a floating ledger row:

- When user reduces outstanding, dialog auto-fetches unpaid invoices + opening balance.
- Two modes:
  - **Simple mode (default):** enter target new balance → engine auto-splits into `voucher_entries (type='receipt')` allocated FIFO (Opening Balance → oldest invoices).
  - **Advanced mode:** manual per-invoice allocation grid (like Customer Payment tab).
- Adjustment is stored ONLY as metadata / audit note; the actual money movement is a proper receipt voucher.
- Reversal (Undo) reverses the linked vouchers atomically.

Increase adjustments (customer owes more) continue as a single opening-balance debit voucher — no invoice allocation needed.

### Layer 2 — Detection (nightly drift scan)

Extend the existing **Settlement Drift Detection** cron with a new check `customer_adjustment_drift`:

For every org, flag customers where:
```
authoritative_signed_outstanding(customer)
  != Σ(invoice_pending) + opening_balance_pending − advances − credit_notes
```
Drift > ₹1 → insert into `settlement_drift_log` with `drift_type='balance_adjustment_floating'` and a JSON payload listing candidate invoices/opening balance to re-allocate.

Alert surfaces on the existing `/platform-admin/data-integrity` dashboard + WhatsApp owner alert.

### Layer 3 — Auto-Repair (one-click FIFO)

New RPC `repair_customer_floating_adjustments(org_id, customer_id)`:

1. Read pool = sum of adjustments not yet materialized as receipts.
2. Read pending queue = Opening Balance first, then invoices oldest-first.
3. Allocate pool FIFO → create `voucher_entries` (`type='receipt'`, `payment_method='adjustment'`, dated to original adjustment date) with proper `reference_type` / `reference_id`.
4. Mark the source `customer_balance_adjustments` row as `materialized_at=now()`.
5. Verify net closing balance unchanged (guard rail — rollback if it moves > ₹1).

Two entry points:
- **Per-customer button** on Customer Reconciliation page ("Repair floating adjustments").
- **Bulk repair** on Data Integrity dashboard for all flagged rows in an org.

---

## What we will build

1. **DB migration**
   - Add columns `materialized_at timestamptz`, `materialized_by uuid` to `customer_balance_adjustments`.
   - Create RPC `repair_customer_floating_adjustments`.
   - Create detection function `detect_balance_adjustment_drift` + wire into existing drift cron.

2. **Frontend**
   - Rewrite reduce-flow in `CustomerBalanceAdjustmentDialog.tsx` to require allocation (simple + advanced mode).
   - Add "Repair floating adjustments" button on `CustomerReconciliation.tsx` (per customer).
   - Add new "Adjustment Drift" tab on `/platform-admin/data-integrity`.

3. **Backfill (one-time)**
   - Manual insert-tool script that runs `repair_customer_floating_adjustments` for every org, per customer, in dry-run first (report only), then live after your approval.

---

## Guard rails

- Repair RPC is **idempotent** and **balance-preserving** — if closing balance would change by more than ₹1 it aborts and logs to `balance_reconciliation_log`.
- Adjustment dialog keeps the old free-form path behind a `platform_admin`-only toggle for edge cases.
- All changes wrapped in the existing soft-delete + audit-log framework — nothing is destroyed, everything is auditable and reversible.

---

## Rollout order

1. Migration + RPC (schema safe, no behaviour change yet).
2. Nightly detection (read-only, produces a report).
3. Dry-run backfill report → your approval → live backfill.
4. Dialog rewrite (prevents new occurrences).
5. Auto-repair button surfaces in UI.

Ready to start with step 1 (migration + RPC) once you approve.