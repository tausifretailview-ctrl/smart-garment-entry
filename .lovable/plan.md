## Problem

For BAPUSO BOTRE / sale POS/26-27/629 (₹11,200, paid ₹6,200), after issuing CN ₹6,400 and refunding ₹1,400 cash, the customer ledger should close at **₹0**. Instead it shows **₹6,200 Cr**.

Reason: the ledger contains **two ₹6,200 payment rows for the same bill**:

1. `Payment at sale - Cash: ₹6,200` — synthesised from `sales.cash_amount` (correct, this is the real at-sale tender).
2. `Phase 4 backfill: legacy POS receipt for POS/26-27/629` — a voucher row (`BCK/43a44550/7d9139`, ₹6,200 cash) created by a one-off historical migration to backfill receipts for legacy POS bills that had no voucher entry.

Because the bill already carries the tender in `cash_amount`, the backfill voucher is a duplicate. The ledger UI renders both → balance overstated by exactly ₹6,200.

**Scope check (system-wide):** running a join of `voucher_entries` (description LIKE 'Phase 4 backfill%') against `sales` where `cash_amount + card_amount + upi_amount > 0` returns **19,968 duplicate vouchers totalling ₹5.31 Cr**. So this affects every legacy POS bill that had real tender data — not just this one customer.

The customer-balance RPC already handles this drift via `GREATEST(paid_amount - adv, non_adv_voucher)` per sale, so reports stay correct — but the **ledger statement UI** does not, and that's what the user sees.

## Fix

Two coordinated changes:

### 1. Data cleanup migration (one-shot)

Soft-delete every Phase 4 backfill voucher whose linked sale already carries equivalent at-sale tender. Safe predicate:

```text
ve.description LIKE 'Phase 4 backfill%'
AND ve.deleted_at IS NULL
AND ve.reference_type = 'sale'
AND backfill_total <= sale.cash + sale.card + sale.upi (within ₹1 tolerance)
```

Set `deleted_at = now()`, `deleted_by = NULL`, leave the voucher row in place for audit. Do **not** touch any backfill voucher whose linked sale has zero tender — those are genuine backfills for bills that really had no receipt recorded.

### 2. CustomerLedger UI guard (defensive)

In `src/components/CustomerLedger.tsx`, when aggregating `allVouchers` for a sale, skip any voucher whose `description` starts with `'Phase 4 backfill'` if that same sale already produced a `Payment at sale` row (cash+card+upi > 0). This protects against any backfill rows that escape the cleanup.

### 3. Verification

After the migration runs, re-open BAPUSO BOTRE's ledger:
- Duplicate `BCK/43a44550/7d9139` row disappears.
- Running balance: −11,200 (invoice) + 6,200 (payment at sale) + 6,400 (CN) − 1,400 (adv refund) = **₹0**.
- Header `Fully Settled` chip stays green.

## Files

- New migration `supabase/migrations/<timestamp>_cleanup_phase4_backfill_duplicates.sql` — soft-deletes the 19,968 duplicate receipts.
- `src/components/CustomerLedger.tsx` — add the "skip backfill row when at-sale tender exists" guard around the voucher loop.

## Out of scope

- Dashboards/reports (`Cash/UPI Paid`, `Returns/CR`, `CN Available`) — already correct in the screenshot, no change needed.
- Customer balance RPC — already uses GREATEST drift handling.
- The Phase 4 backfill migration script itself — historical, will not run again.
