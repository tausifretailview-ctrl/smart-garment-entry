# Fix: Cancelled invoices leaking into Customer Audit Report balance

## Root cause
The Audit Report's "valid sales" filter at three locations checks only `payment_status` (`cancelled`/`hold`), not the authoritative `is_cancelled` boolean. When a sale is cancelled but its `payment_status` was set earlier to `pending`/`completed`, it bypasses the filter and inflates outstanding by its `net_amount`.

Confirmed for **Sugra Mandviwala / ELLA NOOR**:
- Cancelled invoice `INV/26-27/521` (₹7,150, `is_cancelled=true`, `payment_status='pending'`) is being counted as invoiced.
- Real balance: ₹0 (sales ₹61,350 = payments ₹61,350).
- Audit shows: ₹7,150 Dr — exactly the cancelled bill amount.

The classic Customer Ledger and the `reconcile_customer_balances` RPC already filter on `is_cancelled`, which is why they show ₹0 correctly. The mismatch is purely in the Audit Report code path.

## Scope
Frontend-only. No DB writes, no migration.

## Changes

### 1. `src/utils/customerAuditBundle.ts`
- Line 46 (inside `buildAuditRows` loop): change
  ```
  if (st === "cancelled" || st === "hold") continue;
  ```
  to also skip when `s.is_cancelled === true`. Cancelled invoices will not produce Sale / Sale-return-adjust ledger rows in the audit table.
- Line 424 (`computeAuditFormulaOutstanding`): extend the `validSales` filter to drop rows where `is_cancelled === true`.

### 2. `src/utils/customerAuditMath.ts`
- Line 68 (`computeCustomerOutstanding`): extend the `validSales` filter the same way. Add `is_cancelled?: boolean` to the `sales` row type so callers can pass it through.

### 3. Verify display section (no code change expected)
The Audit Report already renders cancelled invoices in its own "Cancelled Invoices in Period" panel using `is_cancelled`, so the row will continue to be displayed there — only the balance math changes.

## Verification (after change)
1. Reload Customer Audit Report → Sugra Mandviwala (ELLA NOOR), period 01-Apr-25 → 31-Mar-27.
   - Closing must show **₹0**, matching the classic Customer Ledger.
   - Cancelled-invoices panel must still list `INV/26-27/521 — ₹7,150`.
2. Spot-check 2 more customers platform-wide with `is_cancelled=true AND payment_status != 'cancelled'`. I will run a query to find candidates and confirm their audit balances drop by the cancelled amount.
3. No change expected for customers whose cancelled bills already had `payment_status='cancelled'` — they were already correctly excluded.

## Out of scope
- Backfilling `payment_status='cancelled'` on the historical `is_cancelled=true` rows. The frontend fix removes the symptom; the data inconsistency is harmless for every other report (they all check `is_cancelled`). If you want a one-shot DB normalization later, that's a separate small migration.
- Continuing the broader Phase 5 ledger reconciliation (717 under-paid sales, 37 ELLA NOOR advance-drift customers). Those are separate from this audit-display bug and remain queued.
