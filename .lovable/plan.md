

# Sale Order Entry - Premium ERP Redesign

## Overview
Apply the same premium, section-based ERP interface design (already implemented for Sale Invoice and Purchase Entry) to the Sale Order Entry screen. This is a purely visual/className update with no business logic changes.

## Current Structure (SaleOrderEntry.tsx, 1860 lines)
Everything is wrapped in a single `<Card className="p-6">` with no visual separation between sections:
- Lines 1187-1202: Header (title + order number)
- Lines 1204-1301: Form fields (date, delivery, customer, tax, salesman, format)
- Lines 1304-1321: Entry mode toggle
- Lines 1322-1418: Product search popover
- Lines 1420-1667: Line items table
- Lines 1672-1729: Summary/totals
- Lines 1731-1741: Notes and terms
- Lines 1743-1753: Action buttons

---

## Changes

### A. Outer Container (line 1188)
- Change from `p-6 space-y-6` to `max-w-[1400px] mx-auto px-6 py-6 space-y-6`

### B. Header Section (lines 1191-1202)
- Break out of the single Card into its own sticky header card
- Title: `text-[18px] font-semibold` with icon
- Order Number: styled with `font-mono bg-muted/40 px-3 py-1 rounded-md`
- Quotation badge stays as-is
- Card styling: `bg-card rounded-xl border shadow-sm p-5 sticky top-0 z-30`

### C. Customer & Order Details Card (lines 1204-1301)
- Wrap in a separate card with `bg-[#F9FAFB] dark:bg-muted/20 rounded-xl border shadow-sm p-6`
- Add section label: "ORDER & CUSTOMER DETAILS" using `erp-invoice-section-label` class
- Customer field gets `col-span-2` for prominence
- Required field labels get red dot indicator
- All inputs: refined focus states with `focus:ring-2 focus:ring-primary/20`

### D. Entry Mode + Product Search (lines 1304-1418)
- Wrap in a card: `bg-card rounded-xl border shadow-sm p-5`
- Entry mode toggle and search button in a clean horizontal bar

### E. Table Card (lines 1420-1667)
- Wrap in `bg-card rounded-xl border shadow-sm p-6`
- Table header: `bg-[#F3F4F6] dark:bg-muted/50` with 12px uppercase bold headers, tracking-wider
- Row height: h-14 (56px), `border-b border-border/50`, `hover:bg-primary/[0.03]`
- Editable inputs: refined with `bg-muted/30 rounded-md` focus states
- Financial columns: `tabular-nums text-right`

### F. Summary Card (lines 1672-1729)
- Use `erp-invoice-summary-card` class (already in index.css)
- Section label: "ORDER SUMMARY" uppercase
- Net Amount: `text-[24px] font-extrabold text-primary tabular-nums`
- Divider above total: `border-t mt-4 pt-4`

### G. Notes & Terms (lines 1731-1741)
- Wrap in its own card: `bg-card rounded-xl border shadow-sm p-6`
- Section label: "NOTES & TERMS"

### H. Sticky Action Footer (lines 1743-1753)
- Use `erp-invoice-sticky-actions` class
- Primary button (Book Sale Order): `bg-primary h-11 rounded-lg font-medium shadow-sm`
- Secondary button (Save & Print): `bg-card border h-11 rounded-lg`
- Add Cancel button: outline style

---

## Technical Details

### Files Modified
1. **`src/pages/SaleOrderEntry.tsx`** -- className updates to existing JSX elements, wrapping sections in separate cards, adding section labels. The single wrapping `<Card>` will be replaced with multiple section cards.

### CSS Classes Used
All utility classes (`erp-invoice-section-label`, `erp-invoice-summary-card`, `erp-invoice-table-header`, `erp-invoice-sticky-actions`) are already defined in `src/index.css` from the previous redesign. No CSS changes needed.

### No Logic Changes
- No state, props, or data flow modifications
- No new dependencies
- Purely presentational className updates

