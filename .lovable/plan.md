

## Sales Invoice — Customer Details Card & Product Search Redesign

### What Changes

**1. Customer & Invoice Details section** (lines 2264-2523)

Replace the current `bg-secondary/30 rounded-lg border shadow-sm p-4` card with a clean `bg-white dark:bg-card border-b border-slate-200 dark:border-border px-6 py-4` section:

- Add a left accent bar label: blue vertical bar + "Customer & Invoice Details" in uppercase tracking-widest
- Keep the existing 6-column grid but restyle to `grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3`
- Restyle all `<Label>` elements to `text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 block`
- Move customer balance badge below the customer field (instead of inline with label) with `bg-red-50/bg-green-50` pill styling
- Invoice No input gets `font-mono font-bold text-sm bg-slate-50 border-slate-200 h-9` styling
- All existing logic (customer search popover, brand discounts, transport details, date picker, tax type, salesman) preserved as-is

**2. Product Entry section** (lines 2525-2665)

Replace `bg-card rounded-lg border shadow-sm p-3` with `bg-blue-50/50 dark:bg-blue-950/20 border-b border-blue-100 dark:border-blue-900/30 px-6 py-3`:

- Remove the "Product Entry" label text — the section is self-evident
- Entry mode toggle (Size Grid/Inline) stays but moves to the left
- Barcode input gets `w-[200px] h-10 font-mono bg-white border-slate-200` with Scan icon
- Add a visual `|` divider between barcode and product search
- Product browse search gets `flex-1 h-10 bg-white` with placeholder "Browse products by name, brand, category, size..."
- Total Qty pill redesigned as `bg-blue-600 text-white rounded-lg px-4 py-2` with larger qty text (`text-xl font-bold`)
- All existing search logic, popover, command list preserved

### Files Modified
- `src/pages/SalesInvoice.tsx` — styling changes only in the return JSX (lines ~2264-2665)

### Dark Mode
All new classes include `dark:` variants to maintain theme support.

### Reversibility
Pure CSS/className changes. No logic, state, or hook modifications.

