

## Update RetailERPTemplate to Professional Tax Invoice Format

Based on the annotated printout, the following changes are needed to `src/components/invoice-templates/RetailERPTemplate.tsx`:

### Changes

#### 1. Header Layout Improvements
- **Business name**: Center-aligned with larger, bolder font and more stylish presentation
- **Address & contact**: Center-aligned below business name, slightly larger font
- **Logo**: Make slightly larger and align inside the header area (not overlapping the border)
- **Instagram/social line**: Already handled via `customHeaderText` — no change needed

#### 2. Remove Gap Between Header and "TAX INVOICE" Title
- The annotated photo highlights excess whitespace between the header block and the "TAX INVOICE" line. Set padding/margin to 0 so the title sits flush against the header border.

#### 3. Items Table — Full Grid with All Borders
- Add **vertical lines** between every column using `borderRight` on every cell
- Add **HSN column** and **GST %** column to the table when `showHSN`/`showGSTBreakdown` are enabled
- Ensure table extends to fill available page height with blank rows (already partially done)
- Column alignment: SN center, Description left, Size/HSN/Qty center, Rate/GST%/Amount right

#### 4. GST Breakup Table (Bottom-Left)
- Add a rate-wise GST summary table below the items, grouped by GST rate
- Columns: HSN/SAC, Taxable Value, CGST Rate, CGST Amt, SGST Rate, SGST Amt, Total Tax
- Calculate from each item's `gstPercent` using inclusive extraction: `gstAmt = (total * gstPct) / (100 + gstPct)`

#### 5. Footer Totals (Bottom-Right) — Enhanced
- Add: "Total Before Tax" (taxable amount), "Add: CGST", "Add: SGST", "Round Off"
- Bold "GRAND TOTAL" row
- Add "Amount in Words" row below grand total converting to Indian number words (Rupees ... Only)

#### 6. Legal & Signature Section
- Bottom-left: Terms & Conditions list (already exists)
- Bottom-right: "For [Company Name]" label above "Authorized Signatory" (add company name)

#### 7. Print CSS
- Ensure all borders render as solid black in `@media print`
- Add `-webkit-print-color-adjust: exact` (already present)
- Add `border-color: #000 !important` for all table elements in print media

### Data Flow
- `gstPercent` is already available on each item via `InvoiceWrapper.tsx` commonProps
- `taxableAmount`, `cgstAmount`, `sgstAmount`, `totalTax`, `roundOff` are already passed as props but currently unused by RetailERPTemplate — will now consume them
- Amount-in-words utility: will add inline (same pattern as `CreditNotePrint.tsx` `numberToWords`)

### Files Modified
- `src/components/invoice-templates/RetailERPTemplate.tsx` — all changes in this single file

