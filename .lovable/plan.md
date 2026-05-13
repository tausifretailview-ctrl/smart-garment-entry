## Problem

Faiza Sheikh (Ella Noor) — actual closing balance should be **₹8,900 Cr**, but two screens show wrong values:

1. **Sales Invoice Dashboard** — per-row "Balance" column shows ₹4,600 for `INV/26-27/473` even though status is **Paid** (settled by adjusting ₹4,600 from a credit note).
2. **Customer Account Statement (Audit) ledger** — closing shows **₹13,500 Cr** instead of **₹8,900 Cr**. The "Sale Return Adjust" memo row is silently subtracted from the running balance even though `sales.net_amount` is already stored post-adjust — so the ₹4,600 credit gets counted twice.

## Root cause

DB values for `INV/26-27/473`: `net_amount = 4600`, `paid_amount = 0`, `sale_return_adjust = 4600`.
`net_amount` is **already post-adjust** (the bill's true value after applying ₹4,600 from CN). So:

- **`SalesInvoiceDashboard.tsx` line 3460** computes per-row Balance as `net_amount - paid_amount` and forgets `- sale_return_adjust`. Every other balance/pending calculation in the same file (lines 1230, 1303, 1791, 1819, 1927, 2742, 2857) correctly subtracts `sale_return_adjust`. This single row-render is the outlier.

- **`customerAuditBundle.ts` lines 51–73** pushes a Sale debit row of `net_amount` (post-adjust = 4600) **and** a "Sale return adjust" credit row of `sra` (= 4600). Both rows feed the running balance in `CustomerAccountStatementAuditPage.tsx`, so the bill's true Dr (4600) is fully cancelled by the memo Cr (4600), and the original SR credit row (13,500 Cr) is left un-offset → closing inflates by 4,600.

The same double-count infects `computeCustomerOutstanding` in `customerAuditMath.ts` (`totalInvoiced - totalSaleReturnAdjust` while `totalInvoiced` is already net).

## Fix

### 1. Sales Invoice Dashboard — per-row Balance
`src/pages/SalesInvoiceDashboard.tsx` line 3460: subtract `sale_return_adjust` and clamp at 0, matching the rest of the file.

```tsx
₹{invoice.is_cancelled ? 0 : Math.round(Math.max(0,
   (invoice.net_amount || 0) - (invoice.paid_amount || 0) - (invoice.sale_return_adjust || 0)
)).toLocaleString('en-IN')}
```

Result for `INV/26-27/473`: 4600 − 0 − 4600 = **₹0** (matches Paid status).

### 2. Customer Account Statement (Audit) ledger — Tally-style display
`src/utils/customerAuditBundle.ts` `buildAuditRows`:
- When `sale_return_adjust > 0`, push the Sale debit as **gross** (`net_amount + sra`) so the subsequent "Sale return adjust" credit row brings it back down to the actual `net_amount`. Net effect on running balance = `net_amount` Dr (correct).
- Keep the credit row visible for transparency (Tally-style "Less: SR adjust").

```ts
const sra = Number(s.sale_return_adjust || 0);
const grossForDisplay = net + sra;
rows.push({ ... debit: grossForDisplay, credit: 0, ... });
if (sra > 0.005) {
  rows.push({ ... debit: 0, credit: sra, particulars: `Sale return / credit adjusted to ${sn}` ... });
}
```

### 3. Outstanding math
`src/utils/customerAuditMath.ts` `computeCustomerOutstanding`: change `totalInvoiced` to use **gross** (`net_amount + sale_return_adjust`) so subtracting `totalSaleReturnAdjust` is mathematically consistent with the new ledger display. Final outstanding for Faiza Sheikh:

```
0 + (13500 + 9200) − 4600 − 13500(receipt) − 13500(adv used) − 0(unused) + 0
= 22700 − 4600 − 13500 − 13500 = -8900 → 8900 Cr ✓
```

(Matches the corrected ledger closing.)

### 4. Investigate Ella Noor org for similar drift
Run a verification query after the fix to list all customers in Ella Noor where `compute(closing) ≠ ledger(closing)` so the user can spot any remaining advance-adjustment ghosts. Display top mismatches in chat (no DB writes).

## Out of scope

- No DB migration. Underlying `sales.net_amount` and `sale_return_adjust` are correct; only display/aggregation logic is wrong.
- `CustomerLedger.tsx` (the legacy ledger view) already handles this correctly (line 1672–1677 comment) and is not touched.
- No changes to advance-application logic — Faiza's advance (13,500) was correctly consumed by `INV/25-26/1372`.

## Files

- `src/pages/SalesInvoiceDashboard.tsx` (1 line)
- `src/utils/customerAuditBundle.ts` (~10 lines)
- `src/utils/customerAuditMath.ts` (~3 lines)
