

## Plan: Field Sales App — Mobile UX Fixes & Polish (14 fixes)

This is a batch of mobile UX improvements across the Field Sales module. All changes are UI/frontend-only — no database changes needed.

### Files to modify (6 files)

**1. `src/layouts/SalesmanLayout.tsx`**
- **B1**: Replace `<a href>` with `<button onClick>` using `useNavigate` for client-side routing (prevents full-page reload)
- **B4**: Replace `safe-area-pb` CSS class on `<nav>` with inline `style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}`

**2. `src/pages/salesman/SalesmanOrderEntry.tsx`**
- **B2**: Replace N+1 customer balance queries with single batch query using `.in('customer_id', customerIds)`, then group client-side
- **B3**: Add `<Textarea>` for notes above Save/Share buttons (import Textarea)
- **B4**: Replace `safe-area-pb` class with inline style
- **B7**: Increase touch targets from `h-7 w-7` to `h-10 w-10` on Minus/Plus/Trash buttons; widen quantity display to `w-10`
- **B12**: Replace `window.__salesmanSearchTimer` with `useRef` for debounce
- **B13**: Change customer dialog `max-h-[80vh]` to `max-h-[60dvh] sm:max-h-[80vh]`
- **B14**: Add "(incl. GST)" label to total line
- **UI-4**: Skip — requires new state management and dialog for price editing, too complex for this batch

**3. `src/pages/salesman/SalesmanOrders.tsx`**
- **B8**: Reorganize order card buttons into 2-row layout (full-width View, then Accept+Share row)
- **B9**: Add `setLoading(true); setOrders([]);` at start of `fetchOrders()`
- **UI-1**: Add search bar with `useState` filter above Tabs; filter `displayOrders` by order_number/customer_name
- **UI-2**: Add green left border on accepted orders via `cn()` conditional class

**4. `src/pages/salesman/SalesmanOrderView.tsx`**
- **B4**: Replace `safe-area-pb` class with inline style
- **B10**: Wrap table in `overflow-x-auto` container, condense to 4 columns (merge Size into Description)
- **B11**: Add GST breakdown footer (taxable value, GST, grand total)
- **UI-5**: Update `shareOrder` to use `navigator.share()` with WhatsApp and clipboard fallbacks

**5. `src/pages/salesman/SalesmanCustomerAccount.tsx`**
- **B4**: Replace `safe-area-pb` class with inline style

**6. `src/pages/salesman/SalesmanDashboard.tsx`**
- **UI-3**: Replace "Welcome back!" with personalized greeting using `useFieldSalesAccess()` hook; add RefreshCw button

### Technical notes
- `useRef` for search debounce replaces global `window` property (B12)
- `env(safe-area-inset-bottom)` CSS function handles iPhone home indicator natively (B4-B6)
- Batch customer balance query reduces 20 network calls to 1 (B2)
- `navigator.share()` API provides native OS share sheet on mobile (UI-5)
- `useFieldSalesAccess` already exports `employeeName` — just needs to be imported in Dashboard (UI-3)

