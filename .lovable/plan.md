# ELLA NOOR — full customer balance audit (Dr / Cr) — read-only

## Goal

Independently prove whether the Dr/Cr figures on the Customer Balances page are the true
position for every customer, and hand back a report listing exactly which accounts are correct
and which are off, with the rupee amount and the reason for each mismatch.

## What we're auditing against (verified)

The Customer Balances page reads `get_customer_party_balances` →
`_get_customer_party_balances_rows_v2`. Reading that function's source, a customer's signed
balance is built from seven components:

```text
opening balance
+ total invoiced          (active, non-cancelled, non-hold sales)
- sale return on invoice  (with a gate that ignores MRP-gross-absorbed returns)
- receipt payments        (per-invoice + customer-level, advance adjustments excluded)
- paid-at-sale drift      (cash/card/UPI recorded on the bill but no matching receipt)
- pending credit-note / sale-return pool
- unused advance pool
+ manual balance adjustments
```

Current data volume in the org: **7,639 customers, 4,399 sales, 4,729 vouchers,
217 sale returns, 101 credit notes, 1,600 advances, 139 manual balance adjustments.**

## The audit

**Step 1 — independent recomputation.** Rebuild each of the seven components in a standalone
read-only query (not by calling the same function the page calls), for all 7,639 customers, and
compare component-by-component against what the page shows. Anything differing by more than ₹1
is flagged.

**Step 2 — classify every flagged account** into the known failure patterns:

| Pattern | Meaning |
|---|---|
| CN double-count | credit-note remainder counted in both the return pool and a receipt |
| Manual-adjustment overlay | a `customer_balance_adjustments` row stacked on top of a fix that already landed (139 such rows exist and each one silently shifts a balance) |
| Paid-amount drift | `sales.paid_amount` disagrees with the receipts actually on the invoice |
| Advance over-application / over-refund | advance consumed or refunded beyond the pool |
| Unrecorded cash/UPI refund | money paid out of the shop with no voucher (the Hanif bhai case) |
| Orphan receipt | receipt pointing at a deleted or cancelled invoice |
| Genuinely correct | page figure matches the recomputation |

**Step 3 — cross-checks that catch what per-customer math can't:**
- Org totals: sum of Dr, sum of Cr, net receivable, unused advance pool — reconciled against
  sales, receipts and returns totals independently.
- Every one of the 139 manual adjustments listed with its tag, amount, date and whether the
  underlying issue it was created for is still present.
- Sale returns whose credit is visible in two places at once.
- Invoices marked Paid with no receipt, and invoices marked Pending that are fully receipted.

**Step 4 — the report.** Written to `docs/ella-noor-customer-balance-audit-2026-08.md` and
summarised in chat:
- Headline: how many of the 7,639 accounts are provably correct, how many are off, total rupees
  of drift on each side.
- Table of every mismatched customer: name, page balance, audited balance, difference,
  pattern, and the specific document (invoice / return / voucher) causing it.
- Top 25 Dr and top 25 Cr accounts individually verified line by line, since those carry the
  money.
- A prioritised repair queue (P0/P1/P2), each entry saying exactly what write would fix it.

Nothing is changed in this pass — no vouchers, no adjustments, no balances. Repairs happen only
after you review the report and approve them.

## Technical notes

- All queries are `SELECT`-only via the read tool. `get_customer_party_balances`,
  `reconcile_customer_balance` and `compute_sale_settlement` currently reject direct SQL
  execution (EXECUTE was revoked from `PUBLIC` in the security hardening pass), so the audit
  recomputes the formula inline rather than calling them — which is the stronger check anyway,
  since it does not inherit the page's own bugs.
- Customers are processed in batches to stay under the 1,000-row result cap; the report is
  assembled from the batches.
- Existing artefacts reused for continuity: `docs/customer-balance-verification-recipe.md`,
  `docs/ella-noor-phase1-repair-queue.md`, and the `scripts/ella-noor-*` audit SQL.
