

## Enhance Item Wise Stock Report — Multi-Field Grouping, Supplier, Pagination, Excel & PDF Export

### Problem
The current `ItemWiseStockReport.tsx` only groups stock by **product name** and lacks:
1. **Supplier name** data — not fetched at all (products table has no supplier_name; it's on `batch_stock → purchase_bills`)
2. **Grouping by other fields** — user wants to view stock grouped by Supplier, Brand, Category, Department (not just product name)
3. **PDF export** — only Excel export exists
4. **Filter options hit 1000-row limit** — same issue as Stock Report

### Plan

**File: `src/pages/ItemWiseStockReport.tsx`** — Major rewrite

#### 1. Add "Group By" selector
- Add a dropdown at the top: **Product Name** (default), **Supplier**, **Brand**, **Category**, **Department**
- Each mode aggregates stock_qty, purchase_value, sale_value by the selected field
- Table header "Particulars" label changes to match the selected group field

#### 2. Fetch supplier data from batch_stock
- After fetching all product_variants with products join, also fetch `batch_stock` with `purchase_bills(supplier_name)` join (paginated, same pattern as StockReport)
- Build a `variantSupplierMap: Record<variant_id, supplier_name>` 
- Merge supplier_name into each variant row before aggregation
- Add "Supplier" to filter options dropdown

#### 3. Paginate filter options query (fix 1000-row limit)
- Replace the single `supabase.from("products").select("brand, category, style")` with a paginated `while` loop fetching 1000 rows at a time using `.range()`
- Add supplier names from batch_stock data to filter options

#### 4. Add supplier filter dropdown
- New `supplierFilter` state alongside existing brand/category/department filters
- Filter options populated from the batch_stock supplier data

#### 5. Aggregation logic by selected group field
```text
groupBy = "product_name" → aggregate by product_name (current behavior)
groupBy = "supplier"     → aggregate by supplier_name  
groupBy = "brand"        → aggregate by brand
groupBy = "category"     → aggregate by category
groupBy = "department"   → aggregate by style/department
```
- `aggregatedData` useMemo switches grouping key based on `groupBy` state
- Each row shows: Group Name | Stock Qty | Purchase Value | Sale Value

#### 6. Add PDF export
- Use `jsPDF` (already in project dependencies)
- Generate table with headers: Sr.No, Particulars (group field), Stock, Purchase Value, Sale Value
- Include org name, date, group-by label in header
- Grand totals row at bottom
- Auto-pagination for long reports

#### 7. Enhance pagination
- Already has `PAGE_SIZE = 200` and pagination — keep this, ensure it works with all group modes
- Show page numbers (1, 2, 3...) not just Previous/Next for easier navigation

### Technical Details

**Data flow:**
```text
product_variants (paginated)
  → JOIN products!inner (product_name, brand, category, style)
  → PLUS batch_stock → purchase_bills (supplier_name) 
  → Merge into unified rows
  → Aggregate by selected groupBy field
  → Filter → Paginate → Display
```

**Filter options query changes:**
- Paginate products fetch with `.range()` loop
- Fetch batch_stock supplier_names with `.range()` loop  
- Return suppliers list alongside brands, categories, departments

### No changes to
- StockReport.tsx (separate page)
- Any other files — this is a self-contained page enhancement

