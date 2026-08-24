# Hanif bhai (ELLA NOOR) — record the ₹3,050 April refund and close the credit note

## What the data shows right now (verified read-only)

- Customer: **Hanif bhai** (`00c34380-...`), phone 9867721264 — matches the UPI receipt "HANIF YUSUF MILLWALA".
- Sale return **SR/26-27/11** (22-Apr-2026, ₹6,250) → credit note **CN/26-27/95**, status `partially_used`,
  used ₹3,200, **remaining ₹3,050 still shown as available**.
- Invoice **INV/26-27/287** (₹3,200) is settled by receipt **RCP/26-27/330** (credit-note adjustment,
  restored on 20-Aug after the June false-positive repair). Invoice INV/25-26/1362 ₹10,550 is fully paid by RCP/25-26/1359.
- **There is no refund transaction of ₹3,050 anywhere** — no payment voucher, no advance refund, no
  credit-note redemption. The only other entry is a manual balance adjustment
  `[hanif_balance_display_fix_20260822]` of **−₹3,200** on the customer.

So this is not an application bug hiding a refund: the ₹3,050 the shop actually paid out by UPI on
**23-Apr-2026 4:49 pm** was never entered in the software. The app is correctly showing the credit as
still owed to the customer.

## Second issue found alongside it

The manual adjustment of **−₹3,200** (dated 22-Aug) was added while the CN receipt was already restored.
With both present the customer's credit is being counted twice (₹3,050 CN remainder + ₹3,200 adjustment).
This must be re-checked and removed as part of the same repair, otherwise the account will read
₹6,250 Cr instead of ₹0.

## Repair (scoped to this customer + ELLA NOOR org)

1. Record the real refund: a **payment voucher of ₹3,050 dated 23-Apr-2026**, method UPI, narrated as
   "Refund of credit note CN/26-27/95 remainder (UPI, HDFC)" — the same date/amount as the UPI receipt.
2. Consume the credit note: `credit_notes.used_amount` → 6,250, `status` → `fully_used`;
   `sale_returns.credit_available_balance` → 0, `credit_status` → `adjusted` on SR/26-27/11.
3. Reverse the `[hanif_balance_display_fix_20260822]` −₹3,200 adjustment (soft-delete with a repair tag)
   so the credit is not double-counted.
4. Verify: customer party balance and ledger both read **₹0 / Settled**, invoice 287 stays Paid, and
   no pending CN remains on the Sales dashboard.

## Blast-radius check, same batch

List every other ELLA NOOR customer that has (a) a `partially_used` / `partially_adjusted` credit note
remainder **and** (b) a `[*_balance_display_fix_*]` or `[hanif_*]` style manual adjustment on the same
customer. Those are the same double-count pattern and should be reviewed together. Report only —
no bulk write without your confirmation.

## Product change so this stops recurring

Add a **"Refund credit note balance"** action on the sale-return / credit-note screen that books the
payout voucher and consumes the CN in one step. Today a cash/UPI refund against a credit note has no
entry point, which is exactly why this ₹3,050 lived only on the shopkeeper's phone.

## Technical notes

- Data repair via `run_sql` (data only, no schema change): voucher insert, `credit_notes` update,
  `sale_returns` update, soft-delete of the `customer_balance_adjustments` row — all filtered by
  `organization_id = 3fdca631-...` and this `customer_id`.
- Every write carries the tag `[hanif_cn_refund_20260824]` in notes for audit traceability.
- The new UI action reuses the existing voucher-number allocation (`generate_voucher_number`) and the
  CN consumption helpers in `src/utils/saleReturnCnBalance.ts`.
