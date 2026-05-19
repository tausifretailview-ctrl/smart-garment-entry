
## What the user reported

In **VELVET EXCLUSIVE LADIES WEAR & BAGS**, several March–April invoices show as **Not Paid / Pending**, but the user confirms they are actually fully paid. The root cause is two separate things working together — both need to be addressed.

## What I found in the data

I scanned all Velvet POS bills from 1-Mar-2026 onwards. Out of ~28 "pending" bills, **20 bills are wrongly marked pending**. They share a clear fingerprint:

- `payment_method` = `cash` / `card` / `upi` (not `pay_later`)
- A sale-return credit (`credit_applied` / `sale_return_adjust`) was used **plus** the customer paid the remaining net in cash/card/UPI
- The cash/card/UPI tender column equals the net amount (e.g. net 251, cash 251)
- But `paid_amount = 0` and `payment_status = 'pending'`

Examples (all by the same operator):
- POS/26-27/795 — net 251, cash 251 → still pending
- POS/26-27/569 — MANSI GONDKAR, net 4200, UPI 4200, credit applied 7415 → still pending
- POS/26-27/476 — net 9500, UPI 9500, credit applied 12130 → still pending

Many of these have **no customer name** because the operator skipped the customer field on a quick walk-in/exchange flow — exactly the user's hypothesis.

The remaining ~8 pending bills are genuine `pay_later` credit invoices (MITALI MADAM, KAMAL BHAI, etc.) and Hold drafts — those will be **left untouched**.

## Plan

### Step 1 — Data cleanup (Velvet only, scoped)

For Velvet (`organization_id = dafc3d0c-…`), find every non-cancelled, non-deleted sale where:

- `payment_status = 'pending'`
- `payment_method IN ('cash','card','upi','multiple')` (i.e. NOT `pay_later` and NOT `hold`)
- `cash_amount + card_amount + upi_amount >= net_amount − 1` (fully tendered)

…and update:

- `paid_amount = net_amount − COALESCE(sale_return_adjust,0)` (clamped to ≥0)
- `payment_status = 'completed'`
- `payment_date = COALESCE(payment_date, sale_date)`

Expected impact: **~20 bills** corrected, totalling ~₹20,000+ moved from "Outstanding" to "Paid" in reports and customer ledger. No effect on stock, GST, or revenue (only the paid/outstanding flag changes).

### Step 2 — Make customer name compulsory for credit (pay_later) invoices

In `src/pages/POSSales.tsx`, the save handler currently only blocks negative-net credit notes when there's no customer. Add a parallel guard:

- If `effectivePaymentMethod === 'pay_later'` **and** the customer field is empty / "WALK-IN", block the save and show a toast: *"Customer Required for Credit Bill — please add customer name or mobile number before saving a Pay Later invoice."*
- Same guard added in `src/hooks/useSaveSale.tsx` `saveSale` / `updateSale` as a server-call safety net so the rule applies to every entry point (POS, hold-resume, mobile POS).

This matches the existing pattern at line 2533 (negative-net credit-note guard) and the project rule that credit ledger entries must be attributable to a customer.

### Step 3 — Prevent the "exchange + tender" bug going forward

The 20 bug bills all came through the exchange flow (sale return adjust + extra tender). The `saveSale` function already calculates `paidAmt = saleData.netAmount` correctly for single-method cash/card/UPI, but one of the secondary save paths in `POSSales.tsx` (lines 2790 / 2996 / 3766 / 3824 — financer / mobile / hold-resume variants) appears to insert without re-computing `paid_amount`. I'll audit those four payloads and route them through the same `cashAmt/cardAmt/upiAmt → paidAmt` logic used at line 491–501 of `useSaveSale.tsx` so any new sale with cash/card/UPI tender always lands as `completed`.

No schema changes. No migrations. No impact on other organisations.

### Out of scope

- Genuine `pay_later` credit bills (MITALI MADAM, KAMAL BHAI, HEENA PATEL, KAVITA DAMANIA, SHRADDHA MISHRA, SUCCESS NIKESH) — left as pending because they really are outstanding.
- Hold drafts — left as `pending` / `hold`.
- KS Footwear / Ella Noor / other orgs — not touched.

## Verification

After Step 1 runs, I'll re-query Velvet and confirm:
- Zero remaining `pending` bills with `payment_method != 'pay_later'` and full tender
- The 20 customer ledgers no longer show those bills as outstanding
- Daily Tally totals for the affected dates are unchanged (cash/card/UPI already correct — only the flag changes)

After Step 2 + 3, I'll cold-test a Pay Later save with empty customer (should block) and an exchange + cash sale (should save as completed with paid_amount = net).

## Confirmation needed

Shall I proceed with all three steps as above? Specifically: **(a) auto-correct the 20 Velvet bills**, **(b) add the compulsory-customer guard for Pay Later**, **(c) patch the secondary save paths** — or do you want to review the 20-bill list first before the data fix?
