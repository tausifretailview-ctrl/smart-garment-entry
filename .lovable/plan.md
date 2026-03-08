

## Sales Invoice Header Restructure — CSS-Only Changes

### Current State
The header (lines 2208-2277) already has a gradient header bar and flex-column layout. The requested changes refine the styling and move the "last invoice" info into a dedicated second row.

### Changes

**1. Header element** (line 2210)
- Change from `bg-gradient-to-r from-slate-800 to-slate-700 text-white px-6 py-0 flex items-center justify-between h-14 shrink-0 shadow-lg`
- To: `bg-gradient-to-r from-slate-900 to-slate-800 shrink-0 flex flex-col` (two-row container)
- Wrap existing left/center/right content in `<div className="h-[52px] flex items-center px-5 gap-3">`

**2. Title & badge** (lines 2219-2226)
- Change title font size to `text-[15px]`, add divider before it
- Change badge from `rounded-full` to `rounded-md`, update colors to `bg-blue-600`, size to `text-[11px] px-3 py-1`
- Show `savedInvoiceData?.sale_number || nextInvoicePreview` (need to check if `nextInvoicePreview` exists — will use existing `sale_number` logic)

**3. Last invoice info** (lines 2236-2243)
- Move from center of the top row to a second row inside `<header>`
- New styling: `h-[34px] bg-slate-800/80 border-t border-white/10 flex items-center justify-center gap-2 text-[12px] px-5`
- Add Qty display, keep existing sale_number, amount, customer_name
- Remove the `hidden md:flex` pill wrapper — show on all screens in the second row

**4. Nav buttons** (lines 2248-2262)
- Add explicit className: `h-8 text-white/70 hover:text-white hover:bg-white/10 border border-white/15 text-xs gap-1.5`

**5. No logic changes** — all handlers (`handlePreviousInvoice`, `handleNextInvoice`, `handleLastInvoice`, `handlePrintInvoice`, `navigate`) stay identical.

### Files Modified
- `src/pages/SalesInvoice.tsx` — lines ~2208-2277, className-only edits

