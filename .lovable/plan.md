

# Ezzy ERP -- Advanced Enterprise Table System

## Overview

Create a reusable `ERPTable` wrapper component that adds enterprise-grade table features (sticky headers, column resizing, column show/hide, column reorder, density toggle, sticky footer) on top of the existing Ezzy table UI. Then integrate it across the five major dashboard pages.

This requires installing `@tanstack/react-table` (new dependency) and leveraging the already-installed `@dnd-kit` packages for column reorder. No backend logic changes.

---

## Architecture

The system is built as a single generic `ERPTable` component that accepts column definitions and data, and internally manages:

- Column visibility, ordering, and widths (persisted to localStorage keyed by table ID)
- Sticky header via CSS `position: sticky`
- Sticky first column via CSS `position: sticky; left: 0`
- Column resize drag handles
- Column reorder via `@dnd-kit/sortable`
- Density toggle (compact 40px / comfortable 56px row height)
- Sticky footer row for financial totals
- Horizontal scroll container

```text
+--------------------------------------------------+
|  ERPTable                                        |
|  +----------------------------------------------+|
|  | Toolbar: density toggle | column picker       ||
|  +----------------------------------------------+|
|  | overflow-x-auto                               ||
|  | +------------------------------------------+ ||
|  | | Sticky Header (with resize handles)      | ||
|  | | Sticky Col 0 | Col 1 | Col 2 | ...      | ||
|  | +------------------------------------------+ ||
|  | | Data rows                                | ||
|  | +------------------------------------------+ ||
|  | | Sticky Footer (totals)                   | ||
|  | +------------------------------------------+ ||
|  +----------------------------------------------+|
+--------------------------------------------------+
```

---

## New Dependency

- `@tanstack/react-table` -- provides headless table primitives (column defs, visibility, sizing, sorting)

Already installed:
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` -- for column drag-and-drop reorder

---

## New Files

### 1. `src/components/erp-table/ERPTable.tsx`

The main generic component. Accepts:

```text
Props:
  tableId: string               -- unique key for localStorage persistence
  columns: ColumnDef[]          -- @tanstack/react-table column definitions
  data: T[]                     -- row data array
  stickyFirstColumn?: boolean   -- pin first column (default: true)
  footerRow?: ReactNode         -- optional sticky footer content
  defaultColumnVisibility?: Record<string, boolean>
  defaultDensity?: "compact" | "comfortable"
  onRowClick?: (row: T) => void
  onRowContextMenu?: (e, row: T) => void
  renderRowActions?: (row: T) => ReactNode
  isLoading?: boolean
  emptyMessage?: string
```

Internally uses:
- `useReactTable` from `@tanstack/react-table` with `getCoreRowModel`, column visibility, column sizing
- `SortableContext` + `DndContext` from `@dnd-kit` for header drag reorder
- localStorage read/write for column order, visibility, and widths
- CSS `position: sticky` for header and first column

### 2. `src/components/erp-table/ERPTableToolbar.tsx`

Toolbar rendered above the table with:
- Density toggle button (compact/comfortable icons)
- Column visibility dropdown (checkboxes for each column)
- Column order reset button

### 3. `src/components/erp-table/DraggableHeader.tsx`

A single draggable table header cell that wraps `useSortable` from `@dnd-kit/sortable`. Includes:
- Drag handle on hover
- Resize handle (thin vertical bar on right edge, cursor: col-resize)
- Column name text

### 4. `src/components/erp-table/useERPTablePersistence.ts`

Custom hook for reading/writing table settings to localStorage:

```text
Key format: erp-table-{tableId}
Value: {
  columnOrder: string[]
  columnVisibility: Record<string, boolean>
  columnSizing: Record<string, number>
  density: "compact" | "comfortable"
}
```

### 5. `src/components/erp-table/index.ts`

Barrel export file.

---

## Page Integrations

Each page integration follows the same pattern:
1. Define `@tanstack/react-table` column definitions (mapping existing inline JSX to `cell` renderers)
2. Replace the existing `<Table>` block with `<ERPTable>`
3. Move row actions into `renderRowActions`
4. Keep all existing data fetching, filtering, pagination, and business logic untouched

### Pages to integrate:

| Page | File | Table ID | Sticky Col | Footer |
|------|------|----------|------------|--------|
| Customer Master | `src/pages/CustomerMaster.tsx` | `customer_master` | Customer Name | No |
| Sales Invoice Dashboard | `src/pages/SalesInvoiceDashboard.tsx` | `sales_invoice` | Invoice No | Yes (totals) |
| Purchase Bill Dashboard | `src/pages/PurchaseBillDashboard.tsx` | `purchase_bills` | Bill No | Yes (totals) |
| Product Dashboard | `src/pages/ProductDashboard.tsx` | `product_list` | Product Name | No |
| Product Tracking Report | `src/pages/ProductTrackingReport.tsx` | `product_tracking` | Barcode | No |

Each page keeps its existing:
- Search/filter UI
- Pagination controls
- Context menus
- Selection checkboxes
- Expanded row logic (for Purchase/Sales dashboards)

The `<ERPTable>` replaces only the `<Table>...</Table>` block in each page.

---

## CSS Additions (`src/index.css`)

```css
/* ERPTable sticky column */
.erp-table-sticky-col {
  position: sticky;
  left: 0;
  z-index: 5;
  background: inherit;
}

/* ERPTable sticky header + first col intersection */
.erp-table-sticky-col-header {
  position: sticky;
  left: 0;
  z-index: 15;
  background: inherit;
}

/* Column resize handle */
.erp-col-resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  opacity: 0;
  transition: opacity 0.15s;
}

th:hover .erp-col-resize-handle,
.erp-col-resize-handle.resizing {
  opacity: 1;
  background: hsl(var(--primary) / 0.3);
}
```

---

## Existing `useDashboardColumnSettings` hook

The existing hook persists column visibility to the database (per organization). The new ERPTable system uses localStorage for fast, per-user persistence of column order, widths, and density. Column visibility can optionally delegate to the existing hook for pages that already use it (Purchase, Sales, Product dashboards) -- the ERPTable will accept an `externalColumnVisibility` prop for this case.

---

## What Is NOT Changed

- No color theme changes
- No backend/database changes
- No business logic changes
- No data fetching changes
- No print styles modified
- No routing changes
- Existing pagination, search, filters, context menus all preserved
- The base `src/components/ui/table.tsx` primitives remain unchanged (ERPTable uses them internally)

