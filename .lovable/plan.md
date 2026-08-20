# HANIF BHAI (ELLA NOOR) — CN ₹6,250 pending + invoice ₹3,200 unpaid

## What the data actually shows

Verified from the database (read-only):

- Sale return **SR/26-27/11**, dated 22-Apr-2026, ₹6,250, `refund_type = credit_note`,
  `credit_status = adjusted`, linked to invoice **INV/26-27/287**.
  Its `credit_note_id` is **NULL** and `credit_available_balance` is **NULL**.
- Invoice **INV/26-27/287** = ₹3,200, `paid_amount = 0`, `sale_return_adjust = 0`,
  `credit_note_amount = 0`, status `pending`.
- A receipt **RCP/26-27/330 — ₹3,200 "Credit note adjusted against invoice INV/26-27/287"**
  did exist, and was **soft-deleted on 06-Jun-2026** by the bulk repair tagged
  `[cn_over_apply_repair_20260606] phantom credit_note_adjustment receipt removed`.
- No `credit_notes` row exists for this customer, and **no refund voucher of ₹3,050
  (or any refund) exists** anywhere for Hanif bhai.

## Root cause

The June bulk repair assumed any return with `credit_status = adjusted` plus a linked sale
had already been absorbed into the invoice at billing time. For this return that is false —
`sales.sale_return_adjust` on INV/26-27/287 is 0, so nothing was absorbed. Deleting the
₹3,200 receipt removed a genuine adjustment, which produces both symptoms at once:

1. Invoice 287 shows ₹3,200 "Not Paid" on the Sales dashboard.
2. The return shows the **full ₹6,250 still available** — because with `credit_note_id`
   and `credit_available_balance` both NULL, `resolveCnAvailableFromRows`
   (`src/utils/saleReturnCnBalance.ts`) falls back to the return's full net amount.

The customer's ledger net is 10,550 Dr − 10,550 Cr − 6,250 Cr + 3,200 Dr = **₹3,050 credit
in the customer's favour** — consistent with "₹3,200 adjusted, ₹3,050 refunded", except the
refund itself was never recorded anywhere.

## Open question before any repair

There is no ₹3,050 refund record in the system. Either it was paid out in cash/UPI outside
the software, or it was never paid. The repair differs by the answer.

## Fix (after the refund question is answered)

**Data repair (scoped to this customer and org):**
1. Restore the ₹3,200 credit-note adjustment against INV/26-27/287 (undelete
   RCP/26-27/330 rather than issuing a new receipt number) so the invoice settles to Paid.
2. Set `sale_returns.credit_available_balance` on SR/26-27/11 to the true remainder —
   ₹3,050 if the refund stays unrecorded, ₹0 if we also book the refund.
3. If the ₹3,050 really was paid out, record a refund voucher on the actual payout date so
   the ledger closes at zero instead of carrying a floating ₹3,050 credit.

**Blast-radius check, in the same batch:**
List every other ELLA NOOR sale return whose CN receipt was deleted by
`cn_over_apply_repair_20260606` but whose linked sale has `sale_return_adjust = 0` and
`paid_amount = 0`. Those are the same false-positive pattern and get repaired together.
Returns whose linked sale does carry `sale_return_adjust > 0` were correctly repaired and
must be left alone.

**Code guard, so this cannot silently double-show again:**
- In `src/utils/saleReturnCnBalance.ts`, stop falling back to the full net amount when
  `credit_status = 'adjusted'` and a `linked_sale_id` exists with no CN row — resolve the
  applied portion from the linked sale instead of presenting the gross return as available.
- Report the mismatch in the existing Data Integrity dashboard so a return credited on the
  ledger but not reflected on its linked invoice is flagged instead of shown twice.