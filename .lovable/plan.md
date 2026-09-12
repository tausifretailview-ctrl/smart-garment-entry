# Ella Noor — Ayesha ₹700 bill and the other "Not Paid" bills

## What the records show

Bill INV/26-27/2509 (Ayesha Mohamad Ismail, 05/08/2026, ₹700):

- The bill was created on 5 August at 5:15 PM with payment recorded as **nil** — it was saved using the "Pay Later" option.
- There is **no deleted payment** for this bill. The full history for it contains exactly two events: the bill being created on 5 August, and a ₹700 cash payment entered today (12 September, 11:59 AM) from the ellanoor@gmail.com account, which moved it to Paid.
- So nothing was removed automatically. The money was taken in the shop on 5 August (as the notebook shows) but was never entered in the app until today.

Checked the whole organisation for accidental removals as well: 52 payments have ever been deleted since May, and only **one** of them leaves a bill unpaid today — a ₹4,500 payment deleted on 7 June. All the rest were re-entered or belong to bills that are paid.

The wider picture: 205 bills currently show Not Paid/Partial, ₹16.8 lakh in total. Of these, 184 were saved with "Pay Later" and have no payment entered at all, the rest are part-paid. This is a data-entry gap, not a calculation fault — the app is showing exactly what was entered.

## What I propose to build

1. **Pending Bills worksheet** — on the Sales Invoice Dashboard, a printable/exportable list of every unpaid and part-paid bill (date, bill no, customer, phone, amount, amount due) so the shop can tick it against the notebook.
2. **Bulk settle** — tick several pending bills in the list and record payment for all of them in one action, choosing the payment date and cash/UPI/card. Restricted to admin and manager users only, as requested.
   - Each bill gets a proper receipt with its own receipt number, exactly as a single customer payment does today, so customer balances, the cashier report and the ledger all stay correct.
   - Never over-pays a bill; the amount is capped at what is actually due.
   - Cancelled, on-hold and deleted bills are excluded.
   - Every bulk settlement is written to the audit trail with who did it and when.
3. **The ₹4,500 case from 7 June** — I will show you that bill separately so you can confirm whether the payment was deleted by mistake before anything is changed.

Nothing is changed for Ayesha's bill — it is already correct and paid.

## Technical notes

- Worksheet and bulk-settle UI live in `src/pages/SalesInvoiceDashboard.tsx`, reusing the existing selection checkboxes.
- Settlement goes through the existing receipt-voucher path (`createReceiptVoucher` + `applyRecomputedSalePaymentState`) per bill, in sequence, so `compute_sale_settlement` remains the single source of truth for `paid_amount`/`payment_status`. No direct writes to `sales.paid_amount`.
- Gate on `useUserPermissions` role (admin/manager) plus a server-side check in the settlement RPC path; non-eligible users do not see the action.
- Amount per bill capped at `net_amount − paid_amount − sale_return_adjust`; rows failing the cap are skipped and reported back in a summary toast.
