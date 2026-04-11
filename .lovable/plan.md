

## Plan: Column Visibility Settings in User Rights

### Overview
Add a new "Column Visibility" section in the User Rights page that lets admins toggle which columns appear in Sales Invoice and Purchase Bill tables. This is an organization-level setting stored in the existing `user_permissions` JSON alongside `menu`, `mainMenu`, and `special`. Both SalesInvoice and PurchaseEntry will read these settings and conditionally render columns.

### Toggleable Columns

**Sales Invoice**: HSN, Box, Color, Disc%, Disc ₹, GST%

**Purchase Bill**: GST%, Disc%, MRP (already has a toggle — will integrate)

### Technical Changes

#### 1. User Rights page (`src/pages/UserRights.tsx`)

Add a new `columnVisibility` section to the permissions data structure:

```ts
const columnConfig = [
  {
    id: "sales_invoice",
    name: "Sales Invoice Columns",
    columns: [
      { id: "hsn", name: "HSN" },
      { id: "box", name: "Box" },
      { id: "color", name: "Color" },
      { id: "disc_percent", name: "Disc%" },
      { id: "disc_amount", name: "Disc ₹" },
      { id: "gst", name: "GST%" },
    ],
  },
  {
    id: "purchase_bill",
    name: "Purchase Bill Columns",
    columns: [
      { id: "hsn", name: "HSN" },
      { id: "gst", name: "GST%" },
      { id: "disc_percent", name: "Disc%" },
      { id: "mrp", name: "MRP" },
    ],
  },
];
```

- Add state: `columnVisibility` object keyed by `module.column_id` (e.g., `sales_invoice.hsn: true`)
- All columns default to **enabled** (visible) when no setting exists
- Render a new Card section "Column Visibility" with checkboxes grouped by module
- Save into `permissionData.columns` alongside `menu`, `mainMenu`, `special`

#### 2. Permissions hook (`src/hooks/useUserPermissions.tsx`)

- Extend `UserPermissions` interface to include `columns?: Record<string, boolean>`
- Add helper: `isColumnVisible(module: string, columnId: string): boolean` — returns `true` if no setting exists (default visible), otherwise reads from `permissions.columns`

#### 3. Sales Invoice (`src/pages/SalesInvoice.tsx`)

- Import `useUserPermissions` and call `isColumnVisible('sales_invoice', 'hsn')` etc.
- Conditionally render `<th>` headers and corresponding `<td>` cells for: HSN, Box, Color, Disc%, Disc ₹, GST%
- Adjust the empty-row placeholder cell count and footer `colSpan` dynamically based on visible column count

#### 4. Purchase Entry (`src/pages/PurchaseEntry.tsx`)

- Same pattern: conditionally render HSN, GST%, Disc%, MRP columns based on `isColumnVisible('purchase_bill', ...)`
- The existing `showMrp` toggle for MRP can be unified into this system

### Storage Format

The permissions JSON in `user_permissions.permissions` will look like:
```json
{
  "menu": { ... },
  "mainMenu": { ... },
  "special": { ... },
  "columns": {
    "sales_invoice.hsn": false,
    "sales_invoice.box": false,
    "purchase_bill.gst": false
  }
}
```

Missing keys = column visible (backward compatible).

### No Database Migration Needed
The `permissions` column is already a JSONB field — adding a new `columns` key requires no schema change.

