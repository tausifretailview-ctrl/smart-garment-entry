

## RetailERPTemplate Invoice Updates

### Changes to `src/components/invoice-templates/RetailERPTemplate.tsx`

**1. Remove Receiver's Signature**
- Delete the "Receiver's Signature" block (lines 662-666) from the bottom-left section.

**2. Increase QR Code Size**
- Change QR code dimensions from `80px/55px` to `110px/85px` (A4/A5) — line 657.

**3. Add Note Section After GST Breakup**
- Between the GST breakup/totals row and the "Amount in Words" row, insert a new bordered row that displays `notes` (passed from POS screen). Only shown when notes exist and are not purely numeric.

**4. Increase Date & Time Font Size**
- Change date/time font from `fsCustDetail` (12px/10px) to `fsInvoiceNo` (13px/11px) and add `fontWeight: "bold"` — line 371.

**5. Increase Terms & Conditions Font Size**
- Terms heading: increase from `10px/8px` to `11px/9px` (line 644)
- Terms list items: increase from `9px/7px` to `10px/8px` (line 645)

**6. Dark Column Headers**
- Change header `backgroundColor` from `#f0f0f0` to `#333` with `color: #fff` — line 411-412. This makes column headers (SN, Description, Size, HSN, Qty, Rate, GST%, Amount) appear as white text on dark background.

### Files Modified
- `src/components/invoice-templates/RetailERPTemplate.tsx` — single file, all changes

