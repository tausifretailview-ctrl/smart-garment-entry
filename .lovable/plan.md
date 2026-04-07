

## Analysis

After reviewing `EInvoicePrint.tsx`, most of the bugs listed are **already fixed** in the current code:

- **Bug 1 (GST per-item calc)**: Already fixed at lines 82–93 — computes per-item taxable/CGST/SGST.
- **Bug 2 (CGST/SGST columns)**: Already present at lines 226–228 with per-line values.
- **Amount in Words**: Already present at line 341 using `numberToWords`.

The only missing feature is:

### What needs to be added: e-Way Bill Number block

The edge function sends `EwbDtls` but the print template doesn't display the e-Way Bill number.

### Plan

**File: `src/components/EInvoicePrint.tsx`**

1. Add `ewb_number` and `ewb_date` to the invoice interface (optional fields).
2. Add an e-Way Bill section below the IRN block — only shown when `ewb_number` exists. Display:
   - e-Way Bill Number
   - e-Way Bill Date
   - Styled similarly to the IRN green box but with a blue/teal accent.

This is a single-file, ~15-line change.

