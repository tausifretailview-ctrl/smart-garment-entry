

## Odoo-Style Dashboard Redesign

### What Changes

**1. Full-Width Layout**
- Remove the `xl:grid-cols-[1fr_280px]` sidebar layout constraint
- Use `w-full px-6` wrapper with no max-width cap
- Move the "New Updates" panel into a collapsible section or a smaller row below metrics instead of a fixed sidebar

**2. Odoo-Style MetricCard (`AnimatedMetricCard`)**
- Replace the current `border-t-4` accent + gradient approach with a clean Odoo look:
  - White background (`bg-card`), subtle `border border-border`, `shadow-sm hover:shadow-md`
  - Small colored dot or thin left accent (`border-l-3`) instead of heavy top border
  - Tighter padding: `p-4` with `text-sm` title, `text-2xl font-semibold` value
  - Remove the "↑ Live" badge — replace with a subtle count/label below the value
- Keep existing props (`title`, `value`, `icon`, `accentColor`, `onClick`, `tooltip`, `isCurrency`)

**3. Grid Layout for Cards**
- Use `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6` with `gap-4` (currently `gap-3`)
- Ensures cards don't stack too early on medium screens

**4. Performance Metrics Section**
- Wrap Row 3 (Inventory & Financial: Products, Stock Qty, Stock Value, Gross Profit, Receivables, Cash Collection) in a distinct section with:
  - Light gray background `bg-muted/30 rounded-lg p-4 border border-border`
  - Section heading: "Inventory & Financial Overview"

**5. Typography & Alignment**
- All numerical values use `tabular-nums font-mono text-right` or `text-center` alignment
- Titles: `text-xs font-medium uppercase tracking-wider text-muted-foreground`
- Values: `text-xl font-semibold text-foreground` (slightly smaller than current `text-2xl`)

**6. Visual Polish**
- Cards: `shadow-sm` default, `shadow-md` on hover with `transition-shadow duration-150`
- Remove the animated slide-in (`animate-in fade-in-0 slide-in-from-bottom-2`) for cleaner feel
- Command toolbar styling stays but gets tighter spacing

### Files Modified
- `src/pages/Index.tsx` — AnimatedMetricCard component restyling, layout grid changes, section grouping

### What Does NOT Change
- All `useQuery` hooks, Supabase RPC calls, `OrganizationContext` integration
- Data extraction logic (salesData, purchaseData, etc.)
- Mobile dashboard (`MobileDashboardWrapper`)
- Navigation click handlers
- Context menu functionality

