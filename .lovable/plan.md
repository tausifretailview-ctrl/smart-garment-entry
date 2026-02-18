

## Stock Ageing Report

A new report page that shows stock items grouped by how long they've been sitting unsold, with supplier filtering and search capabilities.

### What You'll Get

1. **Summary Cards** -- Total aged stock value, items older than 30/60/90 days at a glance
2. **Ageing Buckets** -- Stock categorized into 0-30 days, 31-60 days, 61-90 days, 90+ days based on purchase date
3. **Supplier Filter** -- Dropdown to view aged stock from a specific supplier
4. **Age Threshold Filter** -- Quick buttons to show stock older than 1 month, 2 months, 3 months, or custom
5. **Search** -- Search by product name, barcode, brand, or size
6. **Excel Export** -- Download the filtered aged stock data

### Data Source

The report will use the `batch_stock` table which tracks individual purchase batches with their `purchase_date`. Each batch record links to a variant and tracks remaining `quantity`. This gives exact aging per purchase batch.

### Technical Details

**New file:** `src/pages/StockAgeingReport.tsx` (~400 lines)
- Fetches `batch_stock` records joined with `product_variants` and `products` for names/brands
- Joins with `purchase_bills` for supplier info
- Calculates age in days from `purchase_date` to today
- Groups into aging buckets (0-30d, 31-60d, 61-90d, 90d+)
- Default view: stock older than 30 days
- Server-side filtering by organization, client-side filtering by supplier/search/age threshold
- Pagination (200 rows per page) with "load more" pattern
- Excel export using `xlsx` library

**Modified file:** `src/App.tsx`
- Add route `/stock-ageing` pointing to the new page

**Modified file:** `src/components/AppSidebar.tsx`
- Add "Stock Ageing" menu item under the Reports/Stock section

**Table columns:**
- Product Name, Brand, Size, Barcode, Supplier, Bill No., Purchase Date, Age (days), Qty, Purchase Value, Sale Value, Ageing Bucket badge

**Filters row:**
- Search input (product name/barcode)
- Supplier dropdown (populated from batch_stock join purchase_bills)
- Age threshold dropdown (All, >30 days, >60 days, >90 days)
- Brand dropdown
- Export to Excel button

No database changes required -- this uses existing `batch_stock`, `product_variants`, `products`, and `purchase_bills` tables.

