# Step 2 — duplicate-receipt root-cause fix (built, NOT deployed)

Follows `docs/duplicate-receipt-steps-1-3-2026-09-19.md`. Built and tested; deployment held per instruction.

## Pre-ship safety check: does a DB uniqueness key reject legitimate patterns?

A value/time **signature** key (org + invoice + amount + method + second) **would** reject
real payments. Live evidence, all-time:

| Same-second identical-signature receipt groups | 12 groups / 25 rows / ₹44,675 |
| --- | --- |
| Legitimate among them | ELLA NOOR: two *different* advances (ADV/25-26/0740 + 0741) applied to one invoice, ₹5,000 each, same second — and 2 more like it; 9 school-fee backfill batch rows written in one second |
| Same invoice + amount + method repeats within 1 hour | 58 (57 under 5m 20s) |

So a signature key is **not safe**. Shipped mechanism instead:

`voucher_entries.client_request_id` — **one id per user submit**, unique per organization
(partial index `uq_voucher_entries_client_request_active`, active rows only). A retry of
the *same* click collides; a new, deliberate payment carries a new id and can never be
blocked. Zero false-rejection risk by construction.

## What was built

1. **Idempotency key (root cause).** Column + partial unique index; `createReceiptVoucher`
   accepts `clientRequestId` and never retries past a collision. Wired into all six writer
   paths: POS Dashboard, Customer Payment Tab, Floating Payments, Payments Dashboard,
   Sales-Invoice bulk cash, Settle Customer Account.
2. **Server-side cap at commit (closes the race directly).** Trigger
   `trg_enforce_receipt_within_invoice_cap` → `enforce_receipt_within_invoice_cap()`:
   `BEFORE INSERT`, takes `FOR UPDATE` on the sale row (serialises two racing submits),
   sums live non-CN receipts on that invoice and rejects (`SQLSTATE P0431`) when the new
   one would push the total past `net_amount` + ₹1. Skips CN-application receipts,
   opening-balance/customer receipts, school-fee and hold/cancelled/deleted bills.
   Supervised repair scripts bypass with `set_config('ezzy.skip_receipt_cap','on',true)`.
3. **Client hardening.** Plain messages ("This payment was already recorded…",
   "This bill is already fully settled…") on POS Dashboard, Payments Dashboard, Floating
   Payments; submit buttons already disable while saving on every path.

## Validation

- Live rehearsal in a rolled-back transaction (no rows kept, verified 0 leftovers):
  T1 duplicate on a settled bill **blocked**; T2 genuine payment on an unpaid bill
  **accepted**; T3 second genuine same-second payment (different submit) **accepted**;
  T4 retry of the same submit **blocked**.
- `npm run test:money` — 398 passed, 1 skipped, 47 files (all locked fixtures green).
- `tsgo --noEmit` clean; preview build OK.
- Historical reach: the cap would reject an insert on **42 bills** that are already
  over-credited today (exactly the leak population). It never fires on the other 7,254
  bills that carry receipts. No negative-amount receipts exist, so nothing legitimate
  depends on exceeding the cap.

## Step 3 pre-audit — is the same artefact inflating other harness findings?

Yes, in one category. `detect_settlement_drift` sums `voucher_paid` over **all** receipts
without netting CN-application receipts against the bill's own `sale_return_adjust` (the
Maseera artefact). Against the open drift log:

| Drift type | Open rows | Inflated by the CN + SR-adjust artefact |
| --- | --- | --- |
| OVERSTATED_PAID (critical) | 290 | **0** — unaffected, trustworthy |
| UNDERSTATED_PAID (warning) | 267 | **132**, ₹6,61,484 of apparent "evidence" |
| OVERPAID (warning) | 1,438 | 1 |
| STATUS_MISMATCH (warning) | 50 | 2 |

The 290 criticals stand. Roughly half the UNDERSTATED_PAID warnings must be re-checked
before being treated as real.

Population re-sized with CN netted against SR-adjust: **51 bills / ₹2,99,467** genuinely
over-credited (naive count 53 / ₹3,06,217; then +₹1,000 for SHREEVASTAV POS/875).

SHREEVASTAV was first entered at ₹2,100 because `GREATEST(receipt_vouchers, at_sale_tender)`
discards her ₹1,000 at-sale cash once RCP/799 exists, so RCP/1129 looked like leftover.
Both 1128 and 1129 are already-zero duplicates. Correct row **₹3,100**; post-repair
hand-check **₹16,250 Dr**. See `docs/duplicate-receipt-51-bill-repair-set-2026-09-19.md`.

## Held

- Deployment (awaiting go-ahead).
- Historical repair of the over-credited bills — until the fix is live and verified.
- The 9-way convergence comparison and the C-JS per-invoice credit cap (Step 3 proper).
