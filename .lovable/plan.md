

## Redesign Product History Dialog -- Cards First, Details on Demand

### Overview
Restructure the dialog so it opens with a clean summary-only view (4 total cards). Details are hidden by default and only shown when the user clicks a "View Details" button, with date filters and horizontal scrolling for the tables.

### Changes (single file: `src/components/ProductHistoryDialog.tsx`)

**1. Lazy-load detail queries**
- The 4 detail queries (saleItems, purchaseItems, stockMovements, saleReturns) will only run when the user explicitly clicks "View Details" -- controlled by a `showDetails` state variable. This makes the dialog open faster.

**2. Summary-first layout**
- Dialog opens compact (`max-w-lg`) showing only the 4 summary cards (Current Stock, Total Purchased, Total Sold, Sale Returns).
- A "View Details" button sits below the cards. Clicking it expands the dialog to `max-w-4xl` and reveals the tabs section.

**3. Date filter for details**
- Add `fromDate` and `toDate` state variables with two date `<input type="date">` fields above the tabs.
- All 4 detail queries will filter by date range when set (sales by `sale_date`, purchases by `bill_date`, returns by `return_date`, movements by `created_at`).
- Default: no filter (shows all, latest 100).

**4. Horizontal scroll on detail tables**
- Wrap each `<Table>` inside a `<div className="overflow-x-auto">` so on smaller screens or narrow dialogs, users can scroll horizontally to see all columns.
- Add `min-w-[600px]` on each table to ensure columns don't collapse.

**5. Close details**
- A "Hide Details" button to collapse back to summary-only view.

### Technical Details

- **New state variables**: `showDetails` (boolean), `fromDate` (string), `toDate` (string)
- **Query `enabled` conditions**: Detail queries add `&& showDetails` to their `enabled` flag so they don't fire on dialog open
- **Date filtering**: Applied via `.gte()` and `.lte()` on the appropriate date columns in each query, with `queryKey` including the date range for proper cache invalidation
- **Dialog width**: Conditional class `showDetails ? "max-w-4xl" : "max-w-lg"` on `DialogContent`
- **Imports**: Add `Input` from `@/components/ui/input` and `Button` from `@/components/ui/button`, plus `ChevronDown`/`ChevronUp` icons
- **ScrollBar**: Use existing `ScrollArea` with `showScrollbar` prop and add `overflow-x-auto` wrapper divs around tables

