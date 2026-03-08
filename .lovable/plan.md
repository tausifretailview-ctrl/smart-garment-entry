

## Sales Invoice — Full Screen Layout & Professional Header

### What Changes

**1. Root container** (line ~2193)
- Replace `max-w-[1600px] mx-auto px-4 py-3 space-y-3` with `h-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-background`

**2. New professional header** (replaces lines ~2194-2268)
- Dark gradient bar (`bg-gradient-to-r from-slate-800 to-slate-700`) with fixed `h-14`
- Left section: Back to Dashboard ghost button + divider + "Sales Invoice" title + invoice number badge (shows current `sale_number` from editing or "NEW")
- Center section: Last invoice info pill (hidden on mobile) showing `lastInvoice.sale_number`, amount, customer name
- Right section: Previous/Next navigation arrows + Print button (white/glass style)
- Uses existing variables: `navigate`, `lastInvoice`, `editingInvoiceId`, `handlePreviousInvoice`, `handleNextInvoice`, `handlePrintInvoice`, `handleLastInvoice`, `savedInvoiceData`, `allInvoiceIds`, `navInvoiceIndex`

**3. Main content area** (wraps lines ~2270 onwards through line ~3139)
- Wrap everything after header in `<main className="flex-1 overflow-auto px-4 py-3 space-y-3">`
- The sticky action bar at bottom (line ~2941) stays within main but remains sticky

### Existing Functionality Preserved
- All invoice navigation (Last/Previous/Next) buttons and logic
- Print button with direct print support
- Last invoice info display
- All form fields, table, dialogs, and action bar unchanged
- Dark mode support via `dark:` variants on the header

### Reversibility
This is purely a layout/styling change to the return JSX. No logic, hooks, or state changes. Easy to revert by restoring the original container classes and header markup.

