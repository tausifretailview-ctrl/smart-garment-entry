## Problem

For BALAJI FOOTWEAR KANDIVALI the WhatsApp reminder lists 4 pending invoices summing to **₹38,978**, but the actual ledger outstanding is **₹28,978**.

The ₹10,000 gap is real over-payment sitting on two already-closed invoices:

- INV/25-26/40 — over-applied by ₹2,146
- INV/25-26/124 — over-applied by ₹7,854

Their receipts were posted with `reference = old invoice number`, so the over-payment never reduced the `paid_amount` of the actually-pending bills (INV/473, 485, 641, 337). The customer's *total* balance nets out via the ledger, but the *per-invoice* view double-shows what's truly owed.

Total Outstanding line in the message is correct. Only the bill-wise breakdown is wrong.

## Goal

WhatsApp reminder's bill-wise list must always sum to the same number shown on the "Total Outstanding" line. No customer should ever see internally inconsistent figures.

## Scope (what I'll change)

Frontend-only patch — no schema, no migrations, no edits to existing receipts.

### File: `src/pages/salesman/SalesmanCustomerAccount.tsx`

Add a reconciliation step inside `sendAllOutstandingReminder` (and any sibling reminder builders that list invoices) that:

1. Compute the per-invoice list exactly as today.
2. Compute `billWiseSum = Σ inv.balance`.
3. Compute `trueBillWisePending = ledgerOutstanding − openingBalance`.
4. If `billWiseSum > trueBillWisePending`, there is unallocated credit (₹10,000 in this case). Distribute the difference across the open invoices **FIFO from oldest**, reducing each invoice's displayed balance until the excess is consumed. Invoices that fully absorb become "✓ Adjusted" (₹0) and are dropped from the list.
5. If `billWiseSum < trueBillWisePending`, the remainder is opening-balance / pre-system dues — already shown via the existing "Opening Balance" line, no change needed.
6. Use the reconciled list to build `invoiceLines`; the "Total Outstanding" line is unchanged.

### Same fix in two more places that build a per-invoice pending list

- `src/components/CustomerLedger.tsx` — wherever the "Pending Invoices" block is built for share / WhatsApp.
- `src/components/accounts/CustomerPaymentTab.tsx` — same check; both surface to user-facing reminders.

(I'll grep for every builder that emits per-invoice balance lines and apply the same reconciler — a single shared helper, e.g. `utils/reconcileBillWisePending.ts`, so all paths use one implementation.)

### Optional warning chip (UI only)

When `billWiseSum > trueBillWisePending` by ≥ ₹1, show a small inline note above the reminder preview in the Customer Account screen:

> ₹10,000 unallocated credit was absorbed against the oldest open invoices for this message. Reassign these receipts from the History dialog to fix the underlying records.

This points the user at the real cleanup path without blocking the send.

## What I am NOT touching

- No edits to `sales.paid_amount`, no edits to `customer_ledger_entries`, no `voucher_entries` adjustments. The DB stays untouched — the message just reads the existing data correctly.
- No change to receipt-creation logic, no FIFO auto-spill at the source. (That's a larger, separate change — happy to plan it next if you want.)
- No change to the Total Outstanding number or the ledger PDF.

## Verification

After implementing, re-run the BALAJI FOOTWEAR KANDIVALI reminder. Expected message:

```text
You have 4 pending invoices:

• INV/26-27/641 (31 May) — ₹7,777 — 17d
• INV/26-27/485 (15 May) — ₹4,620 — 33d
• INV/26-27/473 (14 May) — ₹14,600 — 34d
• INV/26-27/337 (30 Apr) — ₹1,981 — 48d
────────────────
Total Outstanding: ₹28,978
```

(₹10,000 absorbed off the oldest *open* invoice in the list, which is INV/337 first then INV/473 then INV/485 then INV/641 — order is configurable; I'll use oldest-first by default. The example above absorbs from the newest because INV/337 is already a fractional balance; tell me which direction you prefer in the answer to question below.)

Sum = 1,981 + 14,600 + 4,620 + 7,777 = ₹28,978 ✓

## Open question

Which direction should the ₹10,000 over-payment be applied across the *open* invoices?

- **(A) Oldest open first** (INV/337 → 473 → 485 → 641). Matches accounting FIFO, but INV/337 would disappear from the list and customer might be confused.
- **(B) Newest first** (INV/641 → 485 → 473 → 337). Matches what a customer expects ("my last payment cleared my latest bill"). Result shown in Verification block above.
- **(C) Proportional** across all open invoices.

Default if you don't answer: **(A) Oldest first** (FIFO).
