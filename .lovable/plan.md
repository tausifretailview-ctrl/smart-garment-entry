## Goal

Refactor the **Retail Tax Ezzy** invoice template (`src/components/invoice-templates/RetailTaxEzzyTemplate.tsx`) to match the BAWLEE reference layout, and verify the inclusive-of-GST math used in the totals.

No other templates (Thermal, Tally, Modern, Wholesale, ERP, Modern Wholesale, etc.) and no calculation services are touched — only the Ezzy template.

## Changes

### 1. Item table — Rate vs Amount columns

Currently:
- `Rate` column = unit rate (`item.rate`)
- `Amount` column = net line total after discount (`item.total`)

New behaviour (matches BAWLEE reference):
- `Rate` column = **line gross before discount** = `qty × unit-rate` (i.e. MRP-level line amount, pre-discount)
- `Disc %` column = unchanged
- `Amount` column = **net after line discount** = `item.total` (unchanged)

Implementation: in `renderCell`, change the `"rate"` case to render `fmt(item.qty * item.rate)` instead of `fmt(item.rate)`. The header label "Rate" stays.

### 2. Totals box (right side, last page)

Replace the current rows with this order, matching the reference:

```text
MRP Total            ₹<sum of qty × rate across all items>
Discount             - ₹<discount>
[S/R Adjust          ± ₹<...>]              (only if non-zero, unchanged)
GST (incl. in MRP)   ₹<totalTax>
[Round Off           ± ₹<...>]              (only if non-zero, unchanged)
Total                ₹<grandTotal>
```

Key edits in the right-hand totals column (around lines 616–660):
- Rename "Sub Total" → **MRP Total**, drop the small "(incl. GST)" sub-label
- Compute `mrpTotal = items.reduce((s,i)=> s + i.qty * i.rate, 0)` and display that instead of the `subtotal` prop
- Keep the Discount row format (`- ₹...`) — already correct
- Keep GST row, change the small sub-label to "(incl. in MRP)"
- Keep Round Off + Total rows unchanged

### 3. GST inclusive-of-GST calculation check

Current formula per item (lines 178–194):

```ts
const taxOnItem  = item.total * gstPct / (100 + gstPct);
const taxableVal = item.total - taxOnItem;
```

This is the **correct** reverse-calc for inclusive pricing, applied on the **net** (post-discount) line amount — which is exactly how Indian retail inclusive-GST bills should be computed. Cross-checked against the BAWLEE reference:

- Net total 6,600 @ 18% → tax = 6600 × 18/118 = **1,006.78** ✓
- Taxable = 6600 − 1006.78 = **5,593.22** ✓
- CGST = SGST = 503.39 ✓

So no maths change is needed. The plan only adds a brief code comment above the loop reaffirming the formula, so future edits don't accidentally break it.

### 4. Out of scope

- No DB / migration / service changes
- No changes to other invoice templates or thermal receipts
- No changes to search, POS flow, or settings
- `subtotal`, `taxableAmount`, `cgstAmount`, `sgstAmount`, `igstAmount`, `totalTax`, `grandTotal` props from the caller stay as-is; the template now derives `mrpTotal` locally from `items` for the display row.

## Files touched

- `src/components/invoice-templates/RetailTaxEzzyTemplate.tsx` — only file modified
