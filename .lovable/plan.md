
# Full View UI Upgrade -- Remaining Pages & Components Audit

## Problem
The global UI components (dialog, input, label, button) were already upgraded to full-view density, but many **page-level files** still have hardcoded compact sizing overrides (`text-xs`, `h-7`, `h-8`, `p-3`, `p-2`, `gap-2`, `text-[10px]`) that override the new defaults, keeping those pages visually cramped.

## Scope of Changes

### Category A -- Product Entry Page (Highest Priority)
**File: `src/pages/ProductEntry.tsx`** (~2500 lines)
This is the most affected page. Nearly every field uses `h-7 text-xs` inline overrides.

Changes needed:
- Remove all `h-7 text-xs` from Input className overrides (let global `h-10` apply)
- Remove all `className="text-xs"` from Label components (let global `text-sm font-medium` apply)
- Change CardHeader `p-3 pb-2` to `p-5 pb-3`
- Change CardContent `p-3` to `p-5`
- Change grid `gap-2` to `gap-3` or `gap-4`
- Change `space-y-1` to `space-y-2`
- Remove `text-[10px]` helper text, use `text-xs` instead
- Page title from `text-lg` to `text-2xl`
- CardTitle from `text-base` to `text-lg`
- Button sizes: remove `h-7 text-xs` overrides
- RadioGroupItem: `h-3 w-3` to `h-4 w-4`

### Category B -- Dashboard Pages with Compact Cards
These pages use `text-xs` in summary cards and table cells:

1. **`src/pages/AdvanceBookingDashboard.tsx`**
   - Card labels: `text-xs` to `text-sm`
   - CardContent padding: `p-3` to `p-4`
   - Table cell fonts: remove `text-xs` overrides
   - Page container: `p-4` to `p-6`
   - Title: `text-xl` to `text-2xl`

2. **`src/pages/SalesInvoiceDashboard.tsx`** (~2600 lines)
   - Summary card labels using `text-xs`
   - Various `text-xs` in table cells and badges
   - Container padding adjustments

3. **`src/pages/PurchaseBillDashboard.tsx`** (~1780 lines)
   - Same pattern: `text-xs` in summary cards and table cells

4. **`src/pages/DeliveryDashboard.tsx`**
   - Summary cards: `text-xs` to `text-sm`
   - Table cell overrides

5. **`src/pages/SaleOrderDashboard.tsx`**, **`src/pages/QuotationDashboard.tsx`**, **`src/pages/PurchaseOrderDashboard.tsx`**, **`src/pages/SaleReturnDashboard.tsx`**, **`src/pages/PurchaseReturnDashboard.tsx`**, **`src/pages/DeliveryChallanDashboard.tsx`**
   - Same card label and table patterns

### Category C -- Entry/Form Pages
These pages have inline `text-xs` on labels and `h-7`/`h-8` on inputs:

1. **`src/pages/SalesInvoice.tsx`** -- Transaction entry form
2. **`src/pages/PurchaseEntry.tsx`** -- Purchase bill entry
3. **`src/pages/SaleOrderEntry.tsx`** -- Sale order entry
4. **`src/pages/QuotationEntry.tsx`** -- Quotation entry
5. **`src/pages/SaleReturnEntry.tsx`** -- Sale return entry
6. **`src/pages/PurchaseReturnEntry.tsx`** -- Purchase return entry
7. **`src/pages/PurchaseOrderEntry.tsx`** -- Purchase order entry
8. **`src/pages/DeliveryChallanEntry.tsx`** -- Delivery challan entry

### Category D -- Master Pages
1. **`src/pages/CustomerMaster.tsx`** -- Mostly OK (uses defaults), minor `text-xs` helper text
2. **`src/pages/SupplierMaster.tsx`** -- Same as customer
3. **`src/pages/EmployeeMaster.tsx`** -- Check for `text-xs`

### Category E -- Report Pages
1. **`src/pages/StockReport.tsx`** -- Filter labels use `text-xs`
2. **`src/pages/StockAnalysis.tsx`** -- Search area `max-w-lg`
3. **`src/pages/ItemWiseSalesReport.tsx`**, **`src/pages/ItemWiseStockReport.tsx`**
4. **`src/pages/AccountingReports.tsx`**, **`src/pages/GSTReports.tsx`**
5. **`src/pages/SalesAnalyticsDashboard.tsx`**
6. **`src/pages/HourlySalesAnalysis.tsx`**
7. **`src/pages/NetProfitAnalysis.tsx`**
8. **`src/pages/PriceHistoryReport.tsx`**

### Category F -- Component Dialogs
1. **`src/components/ProductEntryDialog.tsx`** (~1330 lines) -- Heavy use of `h-7 text-xs`
2. **`src/components/BarTenderLabelDesigner.tsx`** -- `h-8` inputs, `text-xs` labels
3. **`src/components/SizeGridDialog.tsx`**, **`src/components/SizeStockDialog.tsx`**
4. **`src/components/ExcelImportDialog.tsx`**
5. **`src/components/CustomerHistoryDialog.tsx`** -- Already partially upgraded
6. **`src/components/SupplierHistoryDialog.tsx`**
7. **`src/components/StockReconciliation.tsx`**

### Category G -- Settings & Admin
1. **`src/pages/Settings.tsx`** -- Various `text-xs`, `max-w-sm`
2. **`src/pages/PlatformAdmin.tsx`** -- `max-w-md` dialogs
3. **`src/pages/UserRights.tsx`**
4. **`src/pages/Profile.tsx`**

## What Will Change (Pattern)

For each file, the following replacements will be applied consistently:

| Old Pattern | New Pattern | Where |
|---|---|---|
| `className="text-xs"` on Labels | Remove (global default is `text-sm`) | All pages |
| `className="h-7 text-xs"` on Inputs | Remove (global default is `h-10`) | Entry pages |
| `className="h-8"` on Inputs | Remove (global default is `h-10`) | Various |
| `text-xs` on card metric labels | `text-sm` | Dashboard summary cards |
| `CardContent p-3` | `p-4` or `p-5` | Dashboard cards |
| `space-y-1` in forms | `space-y-2` | Entry pages |
| `gap-2` in form grids | `gap-3` | Entry pages |
| `text-[10px]` helper text | `text-xs` | ProductEntry |
| `p-4 space-y-4` page containers | `p-6 space-y-6` | Dashboard pages |
| `text-lg` page titles | `text-2xl font-bold` | Entry pages |

## Files to Modify (Total: ~35 files)

### Phase 1 -- Entry Forms (8 files)
- `src/pages/ProductEntry.tsx`
- `src/pages/SalesInvoice.tsx`
- `src/pages/PurchaseEntry.tsx`
- `src/pages/SaleOrderEntry.tsx`
- `src/pages/QuotationEntry.tsx`
- `src/pages/SaleReturnEntry.tsx`
- `src/pages/PurchaseReturnEntry.tsx`
- `src/pages/PurchaseOrderEntry.tsx`

### Phase 2 -- Dashboard Pages (10 files)
- `src/pages/AdvanceBookingDashboard.tsx`
- `src/pages/SalesInvoiceDashboard.tsx`
- `src/pages/PurchaseBillDashboard.tsx`
- `src/pages/DeliveryDashboard.tsx`
- `src/pages/SaleOrderDashboard.tsx`
- `src/pages/QuotationDashboard.tsx`
- `src/pages/PurchaseOrderDashboard.tsx`
- `src/pages/SaleReturnDashboard.tsx`
- `src/pages/PurchaseReturnDashboard.tsx`
- `src/pages/DeliveryChallanDashboard.tsx`

### Phase 3 -- Report & Master Pages (10 files)
- `src/pages/StockReport.tsx`
- `src/pages/StockAnalysis.tsx`
- `src/pages/ItemWiseSalesReport.tsx`
- `src/pages/SalesAnalyticsDashboard.tsx`
- `src/pages/HourlySalesAnalysis.tsx`
- `src/pages/NetProfitAnalysis.tsx`
- `src/pages/AccountingReports.tsx`
- `src/pages/CustomerMaster.tsx`
- `src/pages/SupplierMaster.tsx`
- `src/pages/EmployeeMaster.tsx`

### Phase 4 -- Component Dialogs (7 files)
- `src/components/ProductEntryDialog.tsx`
- `src/components/BarTenderLabelDesigner.tsx`
- `src/components/SizeGridDialog.tsx`
- `src/components/ExcelImportDialog.tsx`
- `src/components/SupplierHistoryDialog.tsx`
- `src/components/StockReconciliation.tsx`
- `src/components/AddAdvanceBookingDialog.tsx`

## What Will NOT Change
- Color scheme (all HSL values stay the same)
- Database schema or API logic
- Mobile-specific layouts (MobilePOS, MobileDrawer, etc.)
- Print templates (thermal, A4, A5)
- Barcode label designer functional layout (only font/input sizes)
- POS Sales page (separate compact layout by design)
