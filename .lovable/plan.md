

# Fix A5 Vertical Invoice Print Layout — ModernWholesaleTemplate

## Current State
The template already has A5 vertical support (`format='a5-vertical'`) with 148mm × 210mm sizing. However, the print CSS uses only `size: A5 portrait; margin: 5mm` and the internal padding/alignment needs tuning per the user's screenshot.

## Changes — `src/components/invoice-templates/ModernWholesaleTemplate.tsx`

### 1. Print CSS update (line 577-578)
Change A5 vertical `@page` to explicit dimensions with 0 margin (padding handled internally):
```css
@page { size: 148mm 210mm; margin: 0; }
```
Update the page container padding from `5mm` to `10mm` for A5 vertical.

### 2. Header layout fix (lines 243-323)
- Logo stays top-left (already correct)
- "TAX INVOICE" stays top-right (already correct)
- Company details centered (already correct)
- No structural changes needed — layout matches the screenshot

### 3. Table column widths (lines 331-341)
Simplify columns for A5 to reduce cramping. For `a5-vertical`, adjust widths:
- **SR**: 18px → 16px  
- **PARTICULARS**: 80px → keep
- **HSN**: 35px → 30px
- **SIZE/QTY**: 75px → expand (use remaining space)
- Remove fixed width on SIZE/QTY to let it flex with `tableLayout: fixed`

### 4. Total Qty / Sub Total row alignment (lines 388-401)
The `colSpan` values already align with the header columns. Ensure the TOTAL QTY label spans correctly to the QTY column.

### 5. Footer / Summary section (lines 406-512)
- Amount in Words + QR code on left — already correct
- Grand Total breakdown on right — already correct  
- "Authorised Signatory" at bottom right — already correct
- Reduce the signature gap (`marginBottom`) from 15px to 20px for A5 to push it closer to page bottom

### 6. Page container height
Change `minHeight` for a5-vertical from `210mm` to `auto`, and set the inner border wrapper to fill `calc(210mm - 20mm)` (accounting for 10mm padding on each side) to ensure content fills the page and signature stays at bottom.

### Files to modify
- **`src/components/invoice-templates/ModernWholesaleTemplate.tsx`** — Print CSS, padding, column widths, signature spacing

