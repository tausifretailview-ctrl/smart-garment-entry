

## Professional Invoice Template Improvements

This plan updates the `ProfessionalTemplate` component with refined font sizes, compact row heights, new fields (S/R Adjusted Amount, Customer Outstanding), removal of the "Authorized Signatory" section, and improved Terms & Conditions styling.

---

### Changes Summary

All changes are in **one file**: `src/components/invoice-templates/ProfessionalTemplate.tsx`

### 1. Increase Font Sizes (A4 format)

Update the `getFontSizes()` function for the `a4` case:

| Field | Current | New |
|-------|---------|-----|
| Shop Name (businessName) | 14pt | 20pt |
| Address, Mobile, Email | 8pt (small) | 13px |
| Invoice No | 9pt (normal) | 14px bold |
| Date, Payment Mode | 9pt | 13px |
| Customer Name | 9pt bold | 14px bold |
| Customer Mobile | 9pt | 13px |
| Header Title (BILL OF SUPPLY) | 16pt | 16pt (unchanged) |
| Table body | 8pt (small) | 12px |
| Grand Total | 12pt | 14px |
| Terms | 8pt | 11px |

### 2. Table Improvements

- Reduce empty row height from `16px` to `12px` (25% reduction)
- Reduce data row padding from `3px 2px` to `2px 2px`
- Change `minItemRows` default from `12` to `8`
- Table header remains bold (already is)
- Column structure unchanged (Sr, Description, Barcode, Qty, Rate, Amount)

### 3. Add S/R Adjusted Amount Field

Already partially implemented -- the `saleReturnAdjust` prop and rendering exist (lines 676-681). Will verify it appears in the summary between Discount and Grand Total. No change needed here as it already conditionally renders when `saleReturnAdjust > 0`.

### 4. Add Customer Previous Outstanding

- Add new prop `previousBalance?: number` to the interface
- Render below the Balance row in the summary section:
  ```
  Customer Previous Outstanding: Rs XXXX
  ```
- Show only when `showPartyBalance` is true and `previousBalance > 0`

### 5. Remove Authorized Signatory

Remove the "For {businessName}" / "Authorised Signatory" box (lines 826-838). Replace with just the Declaration section spanning full width.

### 6. Terms & Conditions

- Increase font size from `8pt` to `11px`
- Keep compact bullet/ordered list format
- Proper alignment maintained

### 7. QR Code Size

- Increase QR code image from `100px` to `120px`
- Increase container width from `110px` to `130px`

---

### Technical Details

**File:** `src/components/invoice-templates/ProfessionalTemplate.tsx`

Changes by line area:
1. **Lines 34-107 (Interface)**: Add `previousBalance?: number` prop
2. **Lines 207-241 (getFontSizes)**: Update A4 font sizes to new values
3. **Lines 322 (getItemsPerPage)**: Keep A4 at 18 items per page (compact rows compensate)
4. **Lines 142 (minItemRows default)**: Change from `12` to `8`
5. **Lines 401-419 (header)**: Apply `20px` to businessName, `13px` to address/mobile
6. **Lines 448-486 (customer/invoice details)**: Apply `14px bold` to customer name and invoice no, `13px` to other fields
7. **Lines 500-581 (table)**: Reduce row padding and empty row height
8. **Lines 659-743 (summary)**: Add previousBalance row after balanceDue
9. **Lines 795-810 (QR code)**: Increase QR image size
10. **Lines 813-839 (footer)**: Remove Authorised Signatory box, make Declaration full width
11. **Lines 855-871 (terms)**: Increase font to `11px`
