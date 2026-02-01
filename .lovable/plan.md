
# Polish Print and Invoice Layouts for Ezzy ERP

## Overview
This plan will polish all invoice and print templates to be professional, GST-compliant, and printer-friendly, matching the quality of Tally/Zoho invoices. The **Modern Wholesale Template** (size grouping format) will remain unchanged as per requirement.

---

## Current State Analysis

### Existing Templates Identified:
1. **Sales Invoice Templates:**
   - `ProfessionalTemplate.tsx` - Main GST invoice template
   - `TaxInvoiceTemplate.tsx` - Tax invoice format
   - `ClassicTemplate.tsx` - Traditional style
   - `RetailTemplate.tsx` - Retail receipts
   - `CompactTemplate.tsx` - Space-efficient format
   - `MinimalTemplate.tsx` - Basic format
   - `ModernTemplate.tsx` - Modern design
   - `ModernWholesaleTemplate.tsx` - **DO NOT MODIFY** (as per requirement)
   - `DetailedTemplate.tsx` - Comprehensive format

2. **Other Print Components:**
   - `SaleReturnPrint.tsx` - Credit Note for sale returns
   - `CreditNotePrint.tsx` - Customer credit notes
   - `PurchaseReturnPrint.tsx` - Debit Note for purchase returns
   - `QuotationPrint.tsx` - Quotation documents
   - `SaleOrderPrint.tsx` - Sale order documents
   - `InvoicePrint.tsx` - Legacy invoice format

3. **Print Styling:**
   - `src/styles/professional-invoice.css` - Template-specific print CSS
   - `src/index.css` - Global print styles (lines 393-604)

---

## Issues Found

### 1. **Inconsistent Design Language**
- Templates use gradients, rounded corners, and color schemes (UI styling)
- Mixed color schemes (blue, green, purple) not suitable for professional accounting
- Shadows and decorative elements that don't print well

### 2. **GST Compliance Gaps**
- Missing or inconsistent HSN/SAC columns
- CGST/SGST/IGST breakdown not standardized
- Amount in words not consistently implemented
- Tax summary section placement varies

### 3. **Print-Specific Issues**
- Colored backgrounds that waste ink
- Small font sizes (7pt-8pt) that are hard to read
- Inconsistent table borders
- Missing page break controls for multi-page invoices

### 4. **Structure Inconsistencies**
- Bill To / Ship To sections not standardized
- Declaration placement varies
- Bank details section formatting differs
- Signature area not uniform

---

## Implementation Plan

### Phase 1: Create Shared Print Style System
**File: `src/styles/print-invoice-core.css`** (NEW FILE)

Professional base styles that all templates will import:

```text
+--------------------------------------------------+
|  Core Print Variables                             |
|  - Font sizes (header: 10pt, body: 9pt, small: 8pt)
|  - Standard margins and padding
|  - Black/white color scheme for printing
+--------------------------------------------------+
|  Utility Classes                                  |
|  - .print-table (full borders, proper alignment)
|  - .print-header (company header section)
|  - .print-total (right-aligned amount row)
|  - .gst-summary (CGST/SGST/IGST breakup box)
|  - .amount-words (amount in words section)
|  - .signature-block (authorized signatory area)
+--------------------------------------------------+
|  @media print Rules                               |
|  - White background enforcement
|  - Remove shadows, gradients, rounded corners
|  - Proper table borders for all cells
|  - Page break controls
+--------------------------------------------------+
```

---

### Phase 2: Refactor Invoice Templates

#### 2.1 ProfessionalTemplate.tsx
**Changes:**
- Remove gradient backgrounds → solid black header text
- Replace colored borders → solid 1px black borders
- Standardize font sizes: Header 11pt, Body 9pt, Table 8pt
- Add proper GST structure:
  ```text
  +--------------------------------------------+
  | GSTIN: | Invoice No: | Date:              |
  +--------------------------------------------+
  | Bill To:              | Ship To:          |
  +--------------------------------------------+
  | Items Table with GST columns              |
  +--------------------------------------------+
  | Tax Summary | Amount Summary               |
  +--------------------------------------------+
  | Amount in Words                            |
  +--------------------------------------------+
  | Declaration | Signature                    |
  +--------------------------------------------+
  ```
- Ensure all numeric columns right-aligned
- Add HSN column consistently

#### 2.2 TaxInvoiceTemplate.tsx
**Changes:**
- Remove gradient header → simple bordered box with business name
- Standardize table structure with explicit borders
- Add proper tax calculation table (HSN-wise summary)
- Right-align all amount columns
- Add IRN/QR placeholder for e-invoice compatibility

#### 2.3 ClassicTemplate.tsx
**Changes:**
- Remove gradient styling → clean black borders
- Standardize Bill To section
- Add GSTIN prominently in header
- Ensure proper GST breakup

#### 2.4 RetailTemplate.tsx
**Changes:**
- Keep simple layout for receipts
- Ensure proper border printing
- Add compact GST summary

#### 2.5 CompactTemplate.tsx
**Changes:**
- Remove gradient backgrounds
- Ensure borders print properly
- Optimize for thermal/small format printing

---

### Phase 3: Refactor Credit/Debit Notes

#### 3.1 SaleReturnPrint.tsx (Credit Note)
**Current Issues:**
- Using Tailwind classes that may not apply in print
- No proper GST breakup
- Missing credit note number prominently

**Changes:**
- Add "CREDIT NOTE" title prominently
- Include original invoice reference
- Add proper GST reversal columns
- Standard declaration text
- Inline styles for print reliability

#### 3.2 CreditNotePrint.tsx (Customer Credit Voucher)
**Changes:**
- Professional bordered layout
- Clear amount in words
- Terms and conditions section
- Remove purple color scheme → black/white

#### 3.3 PurchaseReturnPrint.tsx (Debit Note)
**Current Status:** Already well-structured with Tally-like format
**Minor Changes:**
- Verify print CSS applies correctly
- Standardize font sizes to match other documents

---

### Phase 4: Refactor Quotation & Sale Order

#### 4.1 QuotationPrint.tsx
**Changes:**
- Remove colored backgrounds
- Professional bordered table
- Clear validity date section
- Standard terms section

#### 4.2 SaleOrderPrint.tsx
**Changes:**
- Standard business document format
- Delivery details section
- Payment terms section

---

### Phase 5: Enhanced Global Print CSS

**File: `src/index.css` (Updates to print section)**

Add new rules:
```css
@media print {
  /* Remove all UI decorations */
  .invoice-print *, 
  .credit-note-print *,
  .debit-note-print * {
    box-shadow: none !important;
    border-radius: 0 !important;
    background: white !important;
    background-image: none !important;
  }
  
  /* Enforce black text */
  .invoice-print, 
  .credit-note-print,
  .debit-note-print {
    color: black !important;
  }
  
  /* Standard table borders */
  .print-table, 
  .print-table th,
  .print-table td {
    border: 1px solid black !important;
  }
  
  /* Right-align amounts */
  .print-table td.amount {
    text-align: right !important;
  }
}
```

---

### Phase 6: Template-Specific Print CSS

**File: `src/styles/professional-invoice.css` (Updates)**

Add Tally-like print formatting:
```css
/* A4 GST Invoice Structure */
@media print {
  .professional-invoice-template {
    font-family: Arial, sans-serif !important;
    font-size: 9pt !important;
    line-height: 1.3 !important;
  }
  
  .professional-invoice-template table {
    border-collapse: collapse !important;
  }
  
  .professional-invoice-template th {
    background: #f5f5f5 !important;
    font-weight: bold !important;
    text-transform: uppercase !important;
    font-size: 8pt !important;
  }
  
  .professional-invoice-template td {
    padding: 4px 6px !important;
  }
  
  /* GST Summary box */
  .gst-summary-table {
    border: 2px solid black !important;
  }
  
  /* Grand total highlight */
  .grand-total-row {
    background: #f0f0f0 !important;
    font-weight: bold !important;
    font-size: 10pt !important;
  }
}
```

---

## Files to Modify

### New Files:
1. `src/styles/print-invoice-core.css` - Shared print utilities

### Modified Files (Templates):
2. `src/components/invoice-templates/ProfessionalTemplate.tsx`
3. `src/components/invoice-templates/TaxInvoiceTemplate.tsx`
4. `src/components/invoice-templates/ClassicTemplate.tsx`
5. `src/components/invoice-templates/RetailTemplate.tsx`
6. `src/components/invoice-templates/CompactTemplate.tsx`
7. `src/components/invoice-templates/MinimalTemplate.tsx`
8. `src/components/invoice-templates/ModernTemplate.tsx`
9. `src/components/invoice-templates/DetailedTemplate.tsx`

### Modified Files (Other Prints):
10. `src/components/SaleReturnPrint.tsx`
11. `src/components/CreditNotePrint.tsx`
12. `src/components/PurchaseReturnPrint.tsx`
13. `src/components/QuotationPrint.tsx`
14. `src/components/SaleOrderPrint.tsx`
15. `src/components/InvoicePrint.tsx`

### Modified Files (Styling):
16. `src/styles/professional-invoice.css`
17. `src/index.css` (print section only)

### Files NOT Modified:
- `src/components/invoice-templates/ModernWholesaleTemplate.tsx` (**PROTECTED**)

---

## Design Standards

### Typography:
| Element | Font Size | Weight |
|---------|-----------|--------|
| Company Name | 14pt | Bold |
| Document Title | 12pt | Bold |
| Section Headers | 10pt | Bold |
| Table Headers | 8pt | Bold, Uppercase |
| Table Body | 9pt | Normal |
| Footer/Terms | 8pt | Normal |
| Amount in Words | 9pt | Italic |

### Colors (Print Mode):
- Background: Pure white (#FFFFFF)
- Text: Pure black (#000000)
- Table headers: Light gray (#F5F5F5)
- Borders: Black (#000000)
- Grand total row: Light gray (#F0F0F0)

### Table Structure:
- Full-width bordered tables
- All cells have explicit 1px black borders
- Numeric columns right-aligned
- Text columns left-aligned
- Center alignment for Sr., Qty, HSN
- Consistent 4-6px cell padding

### Invoice Sections (Standard Order):
1. Company Header (Name, Address, GSTIN, Contact)
2. Document Title (TAX INVOICE / CREDIT NOTE / DEBIT NOTE)
3. Invoice Meta (Number, Date, Due Date)
4. Bill To / Ship To (side by side)
5. Items Table (with GST columns)
6. HSN Summary (optional, for detailed invoices)
7. Amount Summary (Subtotal, Discount, Tax, Grand Total)
8. Amount in Words
9. Bank Details (if applicable)
10. Declaration
11. Terms & Conditions
12. Signature Block

---

## Technical Details

### GST Compliance Columns:
```text
| Sr. | Description | HSN/SAC | Qty | Rate | Taxable | CGST | SGST | Total |
```

For inter-state sales:
```text
| Sr. | Description | HSN/SAC | Qty | Rate | Taxable | IGST | Total |
```

### Tax Summary Table:
```text
| HSN/SAC | Taxable Value | CGST Rate | CGST Amt | SGST Rate | SGST Amt | Total Tax |
```

### Amount in Words Function:
Already exists in `src/lib/utils.ts` as `numberToWords()` - will ensure consistent usage across all templates.

---

## Verification Checklist

After implementation, verify:
- [ ] All invoices print cleanly on A4 paper
- [ ] No UI colors appear in print output
- [ ] All table borders visible when printed
- [ ] GST columns properly aligned
- [ ] Amount in words displays correctly
- [ ] Multi-page invoices break appropriately
- [ ] Credit/Debit notes clearly labeled
- [ ] GSTIN numbers prominently displayed
- [ ] Signature area has adequate space
- [ ] Works correctly in Chrome, Firefox, Edge print dialogs
