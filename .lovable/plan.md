

## Audit: DOLLY JAIN — POS/26-27/459 ₹300 Refund

### What's wrong

The ₹300 net-negative invoice (POS/26-27/459) was saved as a "Mix" refund, **but the actual refund mode breakdown is missing** and the customer balance double-counts the credit.

**Sale POS/26-27/459 in DB:**
| Field | Value |
|---|---|
| gross_amount | 1,599 |
| sale_return_adjust | 1,990 |
| round_off | +91 |
| net_amount | **−300** |
| refund_amount | 300 |
| paid_amount | 0 |
| cash_amount / card_amount / upi_amount | **0 / 0 / 0** |
| payment_method | "multiple" |

**Sale Return SR/26-27/23:** ₹1,990, `credit_status = adjusted`, `linked_sale_id = NULL`.

**Supporting tables:** No row in `customer_advances`, `advance_refunds`, or `voucher_entries` for DOLLY JAIN — so the ₹300 cash outflow is **not booked anywhere**.

### Two concrete problems

**1. Missing payment-mode split (cash flow audit hole)**
"Mix" payment was selected but `cash_amount`, `card_amount`, `upi_amount` are all 0. That ₹300 cash/UPI that left the drawer is invisible to:
- Daily Tally / Daily Cashier Report (won't show as Money Out)
- GST register (no impact, but mode reporting is wrong)
- Reconciliation reports

**2. Customer balance double-counts the SR credit (₹2,290 Cr vs correct ₹1,990 Cr)**

Current ledger math:
```
SR/26-27/23  +1,990 Cr  →  balance 1,990 Cr
POS/459 net  −300 (treated as +300 Cr) → balance 2,290 Cr  ← shown
```

But the customer was physically refunded ₹300 (per the receipt's "Paid via MULTIPLE" line). So the correct balance is **1,990 Cr** — the SR credit, period. The ledger is treating the −300 net as a phantom advance because the ₹300 outflow was never recorded.

### Root cause in code

`POSSales.tsx` saves the sale row with `refund_amount` set but does **not** populate `cash_amount` / `upi_amount` / `card_amount` on the negative-net "Mix refund" path, and does **not** insert a corresponding `advance_refunds` (or voucher) row to register the cash outflow.

The CustomerLedger then has nothing to subtract, so the −300 becomes credit.

### Fix plan

**A. Code fix (POSSales.tsx — Mix-payment refund branch)**
When `net_amount < 0` and `payment_method = 'multiple'`:
1. Capture the refund split entered in the Mix Payment dialog (cash / UPI / card refund amounts).
2. Persist them as **negative** values into `cash_amount` / `upi_amount` / `card_amount` so cashier reports see the outflow.
3. Insert one `advance_refunds` row (or equivalent ledger refund row) tagged to the sale for full audit trail.

**B. CustomerLedger.tsx — render & math**
Add a new ledger row for any sale with `refund_amount > 0`:
```
Refund (Mix: Cash ₹X / UPI ₹Y) for POS/26-27/459   debit ₹300   →  cancels the −300 phantom credit
```
This makes the balance correctly settle at 1,990 Cr.

**C. Data repair for this specific sale (one-time SQL migration)**
Ask the user for the actual refund split (e.g. ₹300 cash, or ₹150 cash + ₹150 UPI), then:
1. Update `sales` row `bc3e3043…` setting `cash_amount` / `upi_amount` to the negative split.
2. Insert an `advance_refunds` row of ₹300 against DOLLY JAIN tagged to POS/26-27/459 for audit.
3. Re-run customer balance reconciliation so DOLLY JAIN shows ₹1,990 Cr.

### What I need from you before implementing

How was the ₹300 actually refunded to DOLLY JAIN at the counter?
- All ₹300 in **Cash** out of the drawer, or
- All ₹300 by **UPI** transfer, or
- A split (e.g. ₹X cash + ₹Y UPI), or
- **Not refunded yet** — keep it as ₹300 advance credit on her account (then we just remove the `refund_amount=300` flag and the balance will read correctly as ₹2,290 advance pending).

### Files to change
- `src/pages/POSSales.tsx` — Mix refund persistence (cash/upi/card split + advance_refunds insert)
- `src/components/CustomerLedger.tsx` — render refund row for sales with `refund_amount > 0`
- New SQL migration — one-time repair for POS/26-27/459 + insert refund record

