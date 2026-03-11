

## Plan: Complete Mobile PWA Redesign — All Pages & Forms

This is a large batch of mobile-specific layouts for 8 pages. The strategy is: add `useIsMobile()` check, render mobile JSX when true, leave desktop JSX untouched. All dialogs rendered in both paths.

### New Shared Components to Create (3 files)

**1. `src/components/mobile/MobilePageHeader.tsx`**
- Sticky header with optional back button, title, subtitle, and right content slot
- Uses `useOrgNavigation` for back navigation

**2. `src/components/mobile/MobileStatStrip.tsx`**
- Horizontal row of stat cards (label, value, color, bg, optional onClick)
- Grid layout, 2-4 columns

**3. `src/components/mobile/MobilePeriodChips.tsx`**
- Horizontal scrollable period filter chips (Today, Month, Year, All)
- Configurable periods, active state styling

### Pages to Add Mobile Views (8 files)

For each page: add `useIsMobile()`, insert `if (isMobile) return <MobileLayout />` before existing return. All existing dialogs/AlertDialogs are duplicated at the bottom of the mobile return.

**4. `src/pages/SalesInvoiceDashboard.tsx`** (2610 lines)
- Mobile view: MobilePageHeader + search + MobilePeriodChips + MobileStatStrip (total amount, pending, invoices, qty) + status filter pills + card-based invoice list with payment status badges + pagination + all existing dialogs
- Uses existing: `paginatedInvoices`, `effectiveStats`, `periodFilter/setPeriodFilter`, `searchQuery/setSearchQuery`, `paymentStatusFilter`, `currentPage`, `totalCount`, `itemsPerPage`, `handlePrintInvoice`, `openPaymentDialog`
- New Invoice button in header → `/sales-invoice`

**5. `src/pages/PurchaseBillDashboard.tsx`** (1703 lines)
- Mobile view: MobilePageHeader + search + MobileStatStrip (total bills, total amount, paid, unpaid) + card-based bill list with payment status + pagination + all existing dialogs
- Uses existing: `paginatedBills`, `summaryStats`, `searchQuery`, `billsQueryLoading`, `currentPage`, `filteredBills.length`, `itemsPerPage`
- New Purchase button in header → `/purchase-entry`

**6. `src/pages/SalesInvoice.tsx`** (3359 lines)
- Mobile view: MobilePageHeader + customer select section + barcode/product search input + items list with qty controls + totals summary + fixed bottom save bar with payment shortcuts (Cash/Card/UPI)
- Uses existing: `lineItems`, `netAmount`, `flatDiscountPercent`, `flatDiscountRupees`, `handleSaveInvoice`, `invoiceDate`, `invoiceNumber`, `searchInput`
- This is complex — the mobile view will reference existing state/handlers but present a simplified single-column form

**7. `src/pages/PurchaseEntry.tsx`** (3423 lines)
- Mobile view: MobilePageHeader + supplier select + bill date/invoice no + barcode search + items list with inline price editing + totals + fixed save bar
- Uses existing: `lineItems`, `billData`, `totals`, `suppliers`, `barcodeInput`, `handleBarcodeSubmit`, `isSaving`

**8. `src/pages/CustomerMaster.tsx`** (844 lines)
- Mobile view: MobilePageHeader + search + customer card list with phone link, edit/history buttons + pagination + all dialogs
- Uses existing: `customers`, `searchQuery`, `isLoading`, `currentPage`, `totalPages`, `isDialogOpen`, `setShowForm` → actually uses `setIsDialogOpen`

**9. `src/pages/DailyCashierReport.tsx`** (1034 lines)
- Mobile view: MobilePageHeader + date navigator (prev/today/next) + hero sales card + payment breakdown (cash/card/UPI) + outstanding section + today's invoice list
- Uses existing: `totals`, `selectedDate`, `salesData`, `isLoading`, `formatCurrency` (need to check if this exists or define inline)

**10. `src/pages/StockReport.tsx`** (1528 lines)
- Mobile view: MobilePageHeader + search + MobileStatStrip (stock value, total qty, variants) + stock item card list (product name, brand, barcode, size, color, qty)
- Uses existing: `filteredStockItems`, `globalTotals`, `hasSearched`, `totalStockValue`, `totalStock`, `searchTerm`

**11. `src/pages/Accounts.tsx`** (522 lines)
- Mobile view: MobilePageHeader + tab selector (Receive/Make Payment/Ledger/Outstanding) + render existing tab components in mobile-friendly wrapper
- Uses existing: `selectedTab`, `setSelectedTab`, `dashboardMetrics`, all tab components already imported

### Key Technical Details

- `useIsMobile()` returns `boolean` from `src/hooks/use-mobile.tsx` (breakpoint 768px)
- Every mobile return includes `<MobileBottomNav />` at the bottom
- All mobile containers use `pb-24` for bottom nav clearance
- Mobile invoice/bill cards use `rounded-2xl`, `shadow-sm`, `border-border/40` pattern
- Dialogs from desktop return must be duplicated in mobile return (they use shared state)
- `formatCurrency` in DailyCashierReport needs to be defined or use inline formatting
- For SalesInvoice and PurchaseEntry mobile forms: simplified single-column layout, barcode input at top, items as cards, fixed bottom action bar

### Implementation Order
1. Create 3 shared components (MobilePageHeader, MobileStatStrip, MobilePeriodChips)
2. Dashboard pages (SalesInvoiceDashboard, PurchaseBillDashboard, DailyCashierReport, StockReport) — list views, simpler
3. Master pages (CustomerMaster, Accounts) — medium complexity
4. Entry forms (SalesInvoice, PurchaseEntry) — most complex, reference many state variables

### Risk Notes
- SalesInvoice.tsx and PurchaseEntry.tsx are 3000+ line files with deep state trees. The mobile view will reference existing state but only expose a subset of controls (barcode entry, qty adjust, save). Advanced features (size grid, price editing, excel import) remain desktop-only.
- Accounts.tsx mobile view will reuse existing tab components — they may not render perfectly on mobile but will be functional. Full mobile redesign of each tab is out of scope for this batch.

