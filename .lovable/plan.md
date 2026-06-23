# Bug audit — Sharmin Mewara (ELLA NOOR)

## What the UI says
- Sales dashboard: 4 invoices, total ₹66,450, balance **₹11,300 Dr** (only INV/26-27/397 unpaid)
- History → Balance Reconciliation widget: **Outstanding (Dr) ₹11,300** (math: 66,450 − 13,450 CN/SR − 38,450 Cash/UPI − 3,250 Advance)
- Sale Returns: 2 returns ₹24,750; SR/26-27/24 (₹11,300) shows "CN/26-27/1" but **remaining ₹11,300** (because CN voucher was deleted), SR/25-26/39 (₹13,450) fully adjusted across INV/231 (11,500) + INV/261 (1,950)

## What the balance functions return
- `get_customer_party_balances.signed_balance` = **−₹2,150** (Cr)
- `get_customer_true_outstanding` (canonical, sums `reconcile_customer_balance`) = **−₹5,400** (Cr)
- Both are wrong. Correct value per the UI/audit is **+₹11,300 Dr**.

## Component trace from `reconcile_customer_balance` for this customer
```
total_invoiced                +66,450
sale_return_adjust_on_invoices −13,450
receipt_payments               −55,150   ← INCLUDES CN-adj + advance vouchers
paid_at_sale_drift                  0
pending_sale_returns                0
credit_note_vouchers                0
customer_payment_refunds            0
advances_applied                −3,250   ← also subtracted here
unused_advances                     0
                              = −5,400
```
Real cash receipts on this customer = RCP/25-26/815 (13,450) + RCP/26-27/386 UPI (25,000) = **₹38,450**. The function's receipt total is 55,150 = 38,450 + 11,500 (RCP/251 `credit_note_adjustment`) + 1,950 (RCP/304 `credit_note_adjustment`) + 2,250 (RCP/385 `advance_adjustment`) + 1,000 (RCP/668 `advance_adjustment`).

The CN-adjustment vouchers and advance-adjustment vouchers represent value **already netted elsewhere**:
- CN-adjustment receipts ↔ `sales.sale_return_adjust` (the same ₹13,450, subtracted again as `sale_return_adjust_on_invoices`)
- Advance-adjustment receipts ↔ `customer_advances.used_amount` (the same ₹3,250, subtracted again as `advances_applied`)

So the canonical receipt CTE is **double-subtracting 13,450 + 3,250 = 16,700**. Difference from truth = 11,300 − (−5,400) = 16,700. ✓ matches exactly.

## Where the double-count happens

Canonical (`reconcile_customer_balance`) `receipt_payments` filter only excludes `advance_application` — it allows both `payment_method = 'advance_adjustment'` and `payment_method = 'credit_note_adjustment'` into the sum.

Party (`_get_customer_party_balances_rows.sale_receipt_vouchers` / `opening_receipt_vouchers`) excludes advance correctly (`payment_method = 'advance_adjustment'` and description LIKE 'Adjusted from advance balance%') but does **not** exclude `credit_note_adjustment`. So party single-counts advance but still double-counts CN.

Party math: 66,450 − 13,450 − 51,900 − 3,250 = −2,150 → off by exactly 13,450 (the CN adjustment receipts). ✓

This is the same class of defect that left **396 customers / ₹55.88 L drift** after the SQL-wrapper migration. The wrapper rewrite fixed plpgsql shadowing but neither function excludes CN-adjustment receipts.

## Fix

### 1. `_get_customer_party_balances_rows` (party)
In both `sale_receipt_vouchers` and `opening_receipt_vouchers` CTEs extend the `NOT (...)` clause to also exclude credit-note adjustment receipts:
```sql
AND NOT (
  lower(COALESCE(ve.payment_method, '')) IN ('advance_adjustment','credit_note_adjustment')
  OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
  OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
  OR lower(trim(COALESCE(ve.description, ''))) LIKE 'credit note adjusted against invoice%'
  OR lower(trim(COALESCE(ve.description, ''))) LIKE 'credit note %→%'
  OR lower(trim(COALESCE(ve.description, ''))) LIKE 'credit note from sale return%'
)
```

### 2. `reconcile_customer_balance` (canonical)
Apply the **same** exclusion to its `receipt_payments` CTE, so `sale_return_adjust_on_invoices` is no longer double-counted as a receipt, and advance applications are no longer double-counted with `advances_applied`.

### 3. Secondary cleanup (data integrity — not part of balance math fix)
When a CN voucher / its adjustment receipts are soft-deleted (as with CN-00004 + RCP-00714 for SR/26-27/24), `sale_returns.credit_status` is not reverted from `adjusted` to `pending`. Add a follow-up trigger or reversal step so credit_status tracks the live vouchers. Out of scope for this balance bug, but it's why the SR row still shows "Adjusted" while owing ₹11,300 CN.

## Verification after fix
Re-run the parity gate on ELLA NOOR (`3fdca631-1e0c-4417-9704-421f5129ff67`):
- Sharmin Mewara: party = canonical = +₹11,300 Dr (matches UI widget)
- Drift rows in full-org gate should drop sharply (expect most of the 396 / ₹55.88 L to disappear; any residual is then real data corruption to investigate separately).

## Files / migrations to touch
- New migration that `CREATE OR REPLACE` both `_get_customer_party_balances_rows(uuid)` and `reconcile_customer_balance(uuid, uuid)` with the extended NOT clause on receipts.
- Run the parity gate again and report drift summary + Sharmin sign-off.
