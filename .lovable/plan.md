

## Fix: Customer Ledger CN Adjustment Showing Wrong Balance

### The bug

For Hanif Bhai (Ella Noor org), Sale Return SR/26-27/11 has `net_amount = ₹6,250`, of which only **₹3,200 was applied** against invoice INV/26-27/287 at billing time (recorded as `sales.sale_return_adjust = 3200` and a `credit_note_adjustment` voucher of ₹3,200). The remaining **₹3,050 is unused CN credit**.

The ledger currently shows:

```text
SR/26-27/11        Credit ₹6,250    ← full SR amount
INV/26-27/287      Debit  ₹6,400    ← gross (net 3,200 + sr_adjust 3,200)
                   Balance ₹150 Dr  ← WRONG, should be ₹3,050 Cr
```

The summary cards above (TOTAL PAID, balance) compute `-₹3,050` correctly because they net the CN-applied voucher, but the running ledger renders the SR credit and the gross invoice as two independent rows, double-counting the ₹3,200 against the customer.

### Fix

Inside `combined.forEach` in `src/components/CustomerLedger.tsx` (the section that renders `cn_adjustment` rows around lines 1121-1147), split each Sale Return into TWO ledger entries when applicable:

**1. Applied portion** (matches a `credit_note_adjustment` voucher on a sale)
   - One row per linked invoice: `Credit = applied_amount`, description: `"Sale Return SR/X — applied to INV/Y"`.
   - Computed by reading `voucher_entries` rows where `payment_method = 'credit_note_adjustment'` and `reference_id` is one of the customer's sales, summed per `sale_return.linked_sale_id`.

**2. Unused / pending portion** (`net_amount − applied`)
   - Single row labelled `"Sale Return SR/X (Pending CN — ₹Z available)"`, with `Credit = unused`.
   - Skipped if unused = 0.

Both rows together always sum to `sale_returns.net_amount`, so the running balance still reconciles with the summary formula.

For Hanif Bhai this becomes:

```text
SR/26-27/11   Credit ₹3,200   (Applied to INV/26-27/287)
SR/26-27/11   Credit ₹3,050   (Pending CN — available)
INV/26-27/287 Debit  ₹6,400   (Incl. SR Adj ₹3,200)
                  Balance ₹3,050 Cr ✓
```

### Technical changes

- **`src/components/CustomerLedger.tsx`**:
  - In the desktop ledger transaction builder (~line 791), fetch `credit_note_adjustment` vouchers per sale once, then build a `Map<sale_return_id, applied_amount>` keyed via `linked_sale_id`.
  - Replace the single `cn_adjustment` push (lines 1121-1147) with up to two pushes: applied (if > 0) and unused (if > 0).
  - Apply the same split in the mobile transaction builder if the file has a mirrored block (search for `cn_adjustment` — there are 27 hits; update each render path consistently).
- **No DB migration** — all data already exists; we are only changing presentation.

### Out of scope

- Changing how invoices store `sale_return_adjust` (already correct).
- Reconciling historical CN adjustments where the voucher row was never written (very rare; would require a separate backfill script).

