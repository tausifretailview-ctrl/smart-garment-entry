
## Add "Retail ERP" Invoice Template

The uploaded image shows a specific invoice layout that closely resembles the existing Retail template but with key differences. This plan creates a new template as an additional option without modifying any existing templates.

### Key Design Elements from the Image
- Header: Business name (bold, large) on left, logo on right
- Title: **"TAX INVOICE"** (not "Bill Of Supply")
- Bill To section on left, Invoice No / Date / Payment on right
- Table columns: Sr., Description, Barcode, Qty, Rate, Amount (6 columns)
- Footer left: Terms & Conditions with bullet points + QR code
- Footer right: Total Qty, Sub Total, **Bill Total** (highlighted/bold box), Received (Today), Current Balance, Previous Balance, **TOTAL DUE**
- "Authorized Signatory" label at bottom right

### Changes Required

**1. New file: `src/components/invoice-templates/RetailERPTemplate.tsx`**
- Copy the structure from `RetailTemplate.tsx` as the base
- Change the title from "Bill Of Supply" to "TAX INVOICE"
- Adjust the footer summary to match the image layout exactly:
  - Show "Total Qty" and "Sub Total" rows
  - Show "Bill Total" in a highlighted/bold box row
  - Show "Received (Today)", "Current Balance", "Previous Balance", "TOTAL DUE"
- Add "Authorized Signatory" text at the bottom right of the footer

**2. Update `src/components/InvoiceWrapper.tsx`**
- Import the new `RetailERPTemplate`
- Add a new case `'retail-erp'` in the template switch statement
- Pass `commonProps` to the new template

**3. Update `src/pages/Settings.tsx`**
- Add `'retail-erp'` to the `invoice_template` type union
- Add a new `SelectItem` option: `"Retail ERP - Tax Invoice ERP Style"`

### Technical Details
- The new template will be a standalone component -- no changes to any existing template
- It reuses the same props interface as `RetailTemplate` for full compatibility
- All existing invoice designs remain completely untouched
