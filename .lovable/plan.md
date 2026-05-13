## Bug — Naseem Jahid (Ella Noor)

When a Sale Return (SR/25-26/57, ₹14,400) is created and **auto-adjusted** ₹5,900 against linked invoice INV/26-27/386, the system does two things at the same time:

1. Reduces `sale_returns.credit_available_balance` from 14,400 → **8,500**.
2. Writes a `credit_note_adjustment` voucher of **5,900** against INV/26-27/386.

Both correctly represent the **same ₹5,900**. But the "Record Payment → From Credit Note (CN)" dialog subtracts them **twice**, and the Customer Ledger "CN Available" card reads from a third out-of-sync source (`credit_notes.used_amount`). That produces every wrong number the user reported:

| Place | Shown | Should be |
|---|---|---|
| Record Payment → Available CN Balance | ₹2,600 | ₹8,500 |
| Ledger card "CN Available" | ₹14,400 | ₹8,500 |
| Ledger top "Advance Balance (Cr)" | ₹7,000 | ~₹1,100 (cascades from above) |

DB confirms: `credit_notes.used_amount = 0`, `sale_returns.credit_available_balance = 8500`, one CN voucher of 5,900 exists.

## Root causes

**A. Double subtraction in `SalesInvoiceDashboard.tsx` `handlePaymentModeChange` (lines ~1830–1894)**

`totalCN` is summed from `saleReturnCnPoolRow(r)` → already returns `credit_available_balance` (post-adjustment).
Then `usedCN` = sum of `voucher_entries` with `payment_method='credit_note_adjustment'` is subtracted again.
Result: 8,500 − 5,900 = **2,600** (wrong; the 5,900 was already deducted from 14,400 to make 8,500).

**B. `credit_notes.used_amount` is never updated**

`handleRecordPayment` updates `sale_returns.credit_available_balance` and inserts a voucher, but never bumps `credit_notes.used_amount`. The Customer Ledger "CN Available" card (`CustomerLedger.tsx` line 216–235) reads `credit_amount − used_amount` and therefore always shows the gross 14,400.

**C. Cascading "Advance Balance (Cr) ₹7,000"**

The audit-formula outstanding pulls in the inflated CN pool, throwing the customer balance off. Fixing A + B re-aligns it. No separate fix needed beyond a one-time refresh.

## Fix plan

### 1. `src/pages/SalesInvoiceDashboard.tsx` — stop double-counting in CN balance dialog

In `handlePaymentModeChange` (lines ~1854–1880), use **either** `credit_available_balance` **or** voucher subtraction, not both. Cleanest: drop the voucher subtraction entirely, since `credit_available_balance` is already the authoritative remaining pool.

```ts
const totalCN = eligible.reduce((sum, r) => sum + saleReturnCnPoolRow(r), 0);
// REMOVE: customerSales fetch, cnVouchers fetch, usedCN subtraction
const totalAvailable = totalCN;
setAvailableCNBalance(totalAvailable);
setSelectedCNReturnId(eligible[0]?.id ?? null);
```

This makes the dialog show ₹8,500 (correct).

### 2. `src/pages/SalesInvoiceDashboard.tsx` — sync `credit_notes.used_amount` on CN apply

In `handleRecordPayment` (the `if (isCreditNoteMode)` branch around line 2024–2052), after updating `sale_returns`, also update the linked credit note row:

```ts
// Look up CN row linked to this sale_return
const { data: cnRow } = await supabase
  .from("credit_notes")
  .select("id, credit_amount, used_amount")
  .eq("organization_id", currentOrganization!.id)
  .eq("customer_id", selectedInvoiceForPayment.customer_id)
  // Match by sale_return id via the existing ensureCreditNoteForSaleReturn link,
  // or by credit_note_id stored on sale_returns
  .eq("id", srRow.credit_note_id)  // pull credit_note_id in the SR select above
  .maybeSingle();

if (cnRow) {
  const newUsed = Math.min(
    Number(cnRow.credit_amount || 0),
    Number(cnRow.used_amount || 0) + amount
  );
  const newCnStatus =
    newUsed >= Number(cnRow.credit_amount || 0) - 0.01 ? "fully_used" : "active";
  await supabase
    .from("credit_notes")
    .update({ used_amount: newUsed, status: newCnStatus })
    .eq("id", cnRow.id);
}
```

Also include `credit_note_id` in the `sale_returns` select on line 2034.

Snapshot/rollback path (the GL-failure branch at lines ~2185–2214) must also restore `credit_notes.used_amount` if the application fails — capture pre-update `used_amount`/`status` in the snapshot block (lines ~1992–2008) and restore alongside the SR rollback.

### 3. One-time data fix for Naseem Jahid (Ella Noor)

After code is deployed, re-sync `credit_notes.used_amount` for CN/26-27/5 to **5,900** (status `active`) so the Ledger CN Available card immediately reflects ₹8,500. We may want a small backfill script across all orgs for any CN where:

```
credit_notes.used_amount = 0
AND exists matching sale_returns with credit_available_balance < net_amount (or voucher_entries with credit_note_adjustment for that customer's sales)
```

Will surface that script for approval after the code change lands.

### Files

- `src/pages/SalesInvoiceDashboard.tsx` — fixes A + B
- (no change to `CustomerLedger.tsx`; once `used_amount` syncs, the card is correct)
- One-time DB update for affected customers (separate approval)

### Out of scope

- The "actual advance remaining is ₹1,100" vs DB ₹5,800 question — DB shows ADV/25-26/0662 unused 1,100 and ADV/26-27/244 unused 4,700 (active, never applied). That's a data review for the user; the 4,700 advance is genuinely sitting unapplied. Will report and ask separately if a cleanup is needed.
