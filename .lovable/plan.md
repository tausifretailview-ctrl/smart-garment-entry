## POS Dashboard Performance Optimization

**Problem**: POS Dashboard shows long loading spinner. Backend/Cloud is healthy — bottleneck is a client-side fetch waterfall in `src/pages/POSDashboard.tsx`.

### Changes to `src/pages/POSDashboard.tsx`

1. **Drop customer GST embed** from the main list query — remove the `customers (gst_number)` join. Fetch GST lazily only if/when needed (e.g. row expand or e-invoice action).

2. **Skip pagination loop overhead** — when the first batch returns less than the page size, exit early without issuing extra range requests.

3. **Guard credit_notes batch fetch** — skip the query entirely when the sales array is empty (avoid `.in('id', [])` round-trip).

4. **Defer Phase 2 (sale_items) fetch** — wrap the secondary `sale_items` fetch in `requestIdleCallback` (with `setTimeout` fallback) so the table renders immediately with totals from the main query, then enriches in the background.

5. **Convert to React Query** — replace the `useEffect` + `useState(loading)` pattern with `useQuery`:
   - `queryKey: ['pos-sales', orgId, dateFilters, ...]`
   - `staleTime: 60_000` so navigating back to POS dashboard returns instantly from cache
   - `placeholderData: keepPreviousData` for smooth filter changes

6. **Skeleton rows instead of centered spinner** — replace the full-screen loader with 8–10 skeleton table rows so users see structure immediately (improves perceived performance).

### Files to edit
- `src/pages/POSDashboard.tsx` (only file touched)

### Out of scope
- No DB migrations, no RPC changes, no schema changes
- Cloud instance is healthy; no upgrade needed
- Other dashboards (Sales Invoice, etc.) untouched