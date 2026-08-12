# SHREE CHHATRAPAL (KS Footwear) — three different outstanding figures

## What the data shows

Three screens report three numbers for the same customer. All three are arithmetically "correct" for the formula each one uses; the underlying invoice records are what's inconsistent.

| Source | Figure | Formula used |
|---|---|---|
| Bill-wise pending invoices (9 bills) | Rs. 73,165 | sum of net − paid_amount − returns |
| Customer Ledger PDF | Rs. 71,899 | invoices − receipt vouchers − settlement discount |
| WhatsApp reminder | Rs. 70,720 | invoices − GREATEST(paid_amount, vouchers) per invoice |

Two concrete data defects explain the whole gap.

**Defect 1 — Rs. 1,179 closed without a receipt (ledger higher than WhatsApp)**

- INV/25-26/280: net 3,165. Receipts 2,785 + discount 95 = 2,880. `paid_amount` = 3,165. Missing 285.
- INV/25-26/499: net 9,936. Receipts 8,744 + discount 298 = 9,042. `paid_amount` = 9,936. Missing 894.

Both invoices are marked completed, but 1,179 was never recorded as either cash or discount. The ledger still counts it as owed (71,899); the WhatsApp reminder trusts `paid_amount` and drops it (70,720). So the settlement discount shown on the ledger (Rs. 393) is understated if these were intended as discounts — the real write-off would be Rs. 1,572.

**Defect 2 — Rs. 2,445 over-receipted on one invoice (bill-wise higher than both)**

INV/25-26/694: net 32,555, but 6 receipts totalling 35,000 are posted against it (5,000 + 5,000 + 1,000 + 9,000 + 10,000 + 5,000). The extra 2,445 was almost certainly meant for one of the 9 open invoices but was tagged to 694, so the open bills never saw it. This is exactly the 73,165 → 70,720 gap.

## Decisions needed before any change

1. The Rs. 1,179 on INV/280 and INV/499 — was it a discount given at settlement (write it off as additional settlement discount), or is it still collectable (reopen those two invoices as partly pending)?
2. The Rs. 2,445 extra on INV/694 — reallocate to the oldest open invoices (FIFO, starting INV/25-26/739), or hold it as customer advance?

## Fix (after the two answers)

**Step 1 — repair the data (organization-scoped, audit-trailed)**
- Rs. 2,445: reassign the excess receipt amount off INV/25-26/694 onto the chosen open invoice(s) via the existing receipt-reassignment path, so `paid_amount` and payment_status of the open bills update through the normal settlement recompute (`compute_sale_settlement`), not by hand-editing columns.
- Rs. 1,179: either record it as settlement discount on the two receipts (ledger discount becomes 1,572 and the invoices legitimately close), or clear `paid_amount` down to the receipted amount so the two bills reopen for 285 / 894.
- Re-run the customer balance reconciliation afterwards and confirm all three screens read the same number.

**Step 2 — stop the three-formula divergence**
The real bug is that the reminder, the ledger PDF and the bill-wise list each derive outstanding independently. Point the WhatsApp reminder in `src/pages/salesman/SalesmanCustomerAccount.tsx` at the same snapshot the ledger uses (`fetchCustomerBalanceSnapshot`), and apply the already-written but currently unused `src/utils/reconcileBillWisePending.ts` helper so the listed bills always sum to the stated total. Today the reminder prints a bill list and a total that come from different formulas with no reconciliation.

**Step 3 — catch it next time**
Add two checks to the existing accounting-invariants view: receipts posted to an invoice exceeding its net amount, and `paid_amount` exceeding recorded receipts + discount. Both defects here would have been flagged the night they were created.

## Technical notes
- Customer id `2bb8e998-9d7d-451a-b6e6-6ace7c29d858`, org `4bc73037-...`. No sale returns, no advances, opening balance 0 — so no other moving parts.
- No column is hand-edited; all repairs go through the existing voucher / settlement RPCs so the ledger keeps a trail.
