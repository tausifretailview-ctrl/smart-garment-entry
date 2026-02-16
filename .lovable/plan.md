

# ERPTable: Expandable Sub-Rows + Remaining Page Migrations

Complete the enterprise table system by adding expandable sub-row support to ERPTable and migrating the 3 remaining pages. Also set default density to "compact" globally.

---

## Part 1: ERPTable Enhancements

### `src/components/erp-table/ERPTable.tsx`

- Change `defaultDensity` default from `"comfortable"` to `"compact"`
- Add new props:
  - `renderSubRow?: (row: T) => React.ReactNode` -- renders expandable content below a row
  - `expandedRows?: Set<string>` -- externally controlled expanded state
  - `onToggleExpand?: (id: string) => void` -- callback when expand toggled
  - `getRowId?: (row: T) => string` -- extract unique ID from row data
- In the row rendering loop, after each `<tr>`, if `expandedRows` contains the row ID and `renderSubRow` is provided, render an additional `<tr>` with a single `<td colSpan={...}>` containing the sub-row content
- Add a built-in expand/collapse chevron as the first visual element when `renderSubRow` is provided

### `src/components/erp-table/useERPTablePersistence.ts`

- No changes needed (density default is controlled by the component prop, not the hook)

---

## Part 2: Page Migrations

### A. Sales Invoice Dashboard (`src/pages/SalesInvoiceDashboard.tsx`)

- Define `@tanstack/react-table` ColumnDef array mapping the existing columns: checkbox, expand toggle, Invoice No, Customer, Phone (conditional), Date, Qty, Discount, Amount, Pay Status (conditional), Balance (conditional), Delivery (conditional), Actions
- Replace the `<Table>...</Table>` block (lines ~1685-2110) with `<ERPTable>`
- Pass `renderSubRow` that renders the existing expanded content (items table, delivery history, sale returns)
- Pass `footerRow` for the page totals row
- Table ID: `sales_invoice`
- Sticky first column: Invoice No
- Keep all existing filters, pagination, context menus, dialogs unchanged
- Remove the old column settings popover (ERPTable toolbar replaces it)

### B. Purchase Bill Dashboard (`src/pages/PurchaseBillDashboard.tsx`)

- Define ColumnDef array: expand toggle, checkbox, Sr.No, Bill No, Date, Invoice No, Supplier Name, Gross Amount, GST Amount, Net Amount, Payment Status (conditional), Items, Actions
- Replace the `<Table>...</Table>` block (lines ~1166-1378) with `<ERPTable>`
- Pass `renderSubRow` for the expanded purchase items detail table
- Table ID: `purchase_bills`
- Sticky first column: Bill No
- Keep existing search, date filters, sort, pagination, context menus, dialogs

### C. Product Dashboard (`src/pages/ProductDashboard.tsx`)

- Define ColumnDef array: expand toggle, checkbox, Sr.No, Image, Product Name, Category, Brand, Style, Color, HSN, GST%, Pur Price, Sale Price, Status, Total Qty, Variants, Actions
- Replace the `<Table>...</Table>` block (lines ~1275-1490) with `<ERPTable>`
- Pass `renderSubRow` for the expanded product variants detail table
- Table ID: `product_list`
- Sticky first column: Product Name
- Keep existing filters panel, search, column toggles, pagination, context menus, dialogs

---

## Part 3: Existing Integrations Update

### Customer Master & Product Tracking Report

- Update existing `<ERPTable>` calls to remove `defaultDensity="comfortable"` if present, so they pick up the new "compact" default

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/erp-table/ERPTable.tsx` | Add renderSubRow, expandedRows, onToggleExpand, getRowId props; default density to compact |
| `src/components/erp-table/index.ts` | Export new types if needed |
| `src/pages/SalesInvoiceDashboard.tsx` | Migrate table to ERPTable with sub-rows and footer |
| `src/pages/PurchaseBillDashboard.tsx` | Migrate table to ERPTable with sub-rows |
| `src/pages/ProductDashboard.tsx` | Migrate table to ERPTable with sub-rows |

---

## What Is NOT Changed

- No backend/database changes
- No business logic changes
- No routing changes
- No print styles modified
- All existing filters, pagination, context menus, dialogs preserved
- The expanded sub-row content (items tables, delivery history, variant details) is rendered exactly as-is, just wrapped by ERPTable

---

## Technical Details

The expanded row pattern works as follows:

```text
rows.map(row => (
  <Fragment key={row.id}>
    <tr> ... normal cells ... </tr>
    {expandedRows.has(getRowId(row.original)) && renderSubRow && (
      <tr>
        <td colSpan={visibleColumnCount} className="bg-muted/20 p-0">
          {renderSubRow(row.original)}
        </td>
      </tr>
    )}
  </Fragment>
))
```

Each page manages its own `expandedRows` state (Set of IDs) and passes it to ERPTable along with the toggle handler. The existing expand/collapse logic in each page is preserved.

