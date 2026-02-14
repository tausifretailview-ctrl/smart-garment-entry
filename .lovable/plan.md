
## Fix: Round-Off Amount Not Showing on Invoice

### Problem
When a manual round-off (e.g., -1190) is applied in POS, the printed invoice shows only "Sub Total" and "Grand Total" without displaying the round-off line item explaining the difference. This confuses customers and staff.

### Root Cause Analysis

**Two issues found:**

1. **Overflow Clipping (Primary Cause)**: The print CSS in `getPageStyle()` (POSSales.tsx line 1698) sets `overflow: hidden` on `html, body` for print media. Combined with A5 page constraints, the amounts breakdown box (Subtotal, Taxable Amount, Round Off) gets clipped when content exceeds the page height. The 12 minimum empty rows in the items table consume most of the A5 page space, leaving no room for the full summary section.

2. **Round-Off Calculation Bug**: In `InvoiceWrapper.tsx`, the round-off is recalculated internally as `grandTotal - (taxableAmount + totalTax)` instead of receiving the actual round-off value from POS. This formula does not account for discount, sale return adjustments, or points redemption that are displayed as separate line items, which can lead to double-counting when those values are non-zero.

### Solution

**1. Pass round-off as a direct prop to InvoiceWrapper**
- Add a `roundOff` prop to InvoiceWrapper instead of recalculating it internally
- POS already tracks the exact round-off value -- pass it directly for accuracy
- Update all InvoiceWrapper call sites in POSSales.tsx to pass `roundOff` from saved/live state

**2. Fix the internal round-off calculation as fallback**
- Update formula to: `grandTotal - (subtotal - discount - saleReturnAdjust + totalTax - pointsRedemptionValue)`
- This ensures round-off only captures the actual rounding, not other deductions

**3. Fix overflow clipping for A5 format**
- Remove `overflow: hidden` from print body styles -- let content flow naturally
- Reduce `minItemRows` for A5 format to prevent content from exceeding page height
- Remove the wildcard `page-break-inside: avoid` rule that prevents natural page flow

**4. Update all invoice templates**
- Ensure ProfessionalTemplate, ClassicTemplate, ModernTemplate, RetailTemplate, and others consistently show the round-off line
- For large round-off values (effectively a bill-level discount), label it as "Discount/Round Off" for clarity

### Files to Change

| File | Change |
|------|--------|
| `src/components/InvoiceWrapper.tsx` | Add `roundOff` prop; fix fallback calculation formula; pass round-off to template |
| `src/pages/POSSales.tsx` | Pass `roundOff` prop to all InvoiceWrapper instances from savedInvoiceData/live state |
| `src/pages/POSSales.tsx` | Fix `getPageStyle()` -- remove `overflow: hidden` from print body |
| `src/components/invoice-templates/ProfessionalTemplate.tsx` | Verify round-off row rendering (code is correct, just needs data fix) |

### Technical Details

Current broken calculation (InvoiceWrapper.tsx line 234):
```
const roundOff = props.grandTotal - (taxableAmount + totalTax);
```

Fixed approach -- prefer prop, fallback to corrected formula:
```
const roundOff = props.roundOff ?? 
  (props.grandTotal - (props.subTotal - props.discount - (props.saleReturnAdjust || 0) + totalTax - (props.pointsRedemptionValue || 0)));
```

POS InvoiceWrapper call -- add roundOff prop:
```
roundOff={savedInvoiceData?.roundOff || roundOff}
```
