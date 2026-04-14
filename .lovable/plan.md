

## Sales Invoice Dashboard — Layout-Only Update

### What Changes
Only the grid container and outer wrapper. Card styles (gradients, colors, padding, typography) stay exactly as-is.

**1. Remove max-width constraint (line 2547)**
- Change `max-w-[1600px] mx-auto` → `w-full` so the dashboard stretches full-width

**2. Update card grid breakpoints (line 2640)**
- Change `grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3`
- To: `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4`
- This prevents cards from hiding/stacking too early on medium screens and adds slightly more breathing room

### What Does NOT Change
- All 7 card styles (gradients, colors, icons, hover effects)
- All data fetching, printing logic, buttons
- Mobile layout, toolbar, table, dialogs
- Typography inside cards

### File Modified
- `src/pages/SalesInvoiceDashboard.tsx` — 2 line changes only

