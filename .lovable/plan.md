

## Plan: Reorganize Sales Invoice Form Layout

### Current Layout
- **Row 1 (header bar)**: Last invoice details (Last: INV/25-26/9 | Qty: 1 | ₹80,999 | customer)
- **Form Row 1**: Customer (2-col span), Invoice No, Invoice Date, Tax Type
- **Form Row 2**: Salesman, Search Invoice

### Proposed Layout
- **Row 1 (header bar)**: Last invoice details + Search Invoice field (moved here, right-aligned)
- **Form Row 1**: Customer (2-col span), Invoice No, Invoice Date, Tax Type, Salesman — all in one row (6-col grid)

This eliminates the second form row entirely, saving vertical space.

### Technical Changes

**File: `src/pages/SalesInvoice.tsx`**

1. **Last invoice info bar (lines ~2822-2835)**: Add the Search Invoice input inside this bar, right-aligned. Remove the search field from the form section below. Style the input to match the dark header bar (transparent bg, white text, compact).

2. **Form grid (line ~2850)**: Change from `grid-cols-5` to include Salesman in the same row:
   - Customer (col-span-2), Invoice No, Invoice Date, Tax Type, Salesman — 6 columns on lg
   - Grid: `grid-cols-2 md:grid-cols-3 lg:grid-cols-6`

3. **Remove the standalone Search Invoice div** (lines ~3147-3175) from the form section entirely.

4. **Always show the header bar** (even without lastInvoice) so the search field is always accessible — show "No invoices yet" or just the search field when there's no last invoice data.

