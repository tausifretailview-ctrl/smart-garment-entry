
# Add Time Display & Phone Column Toggle for POS/Sales Dashboards

## Overview

This plan implements two user-requested enhancements:
1. **Show exact time** after the invoice number (e.g., "POS/25-26/8 | 14:32")
2. **Make Phone column hideable** via the Show/Hide Columns settings (hidden by default)

---

## Changes Summary

### 1. Display Time After Invoice Number

Currently, the Date column shows only the date (`dd/MM/yyyy`). The user wants to see the exact time the invoice was created **next to the invoice number** for quick reference.

**What you'll see:**
```
Before: POS/25-26/8
After:  POS/25-26/8 • 14:32
```

The time will be displayed in a smaller, muted font to keep the invoice number prominent.

### 2. Phone Column Toggle (Hidden by Default)

The Phone column takes up space and is often empty (shows `-`). Adding it to the Show/Hide Columns settings lets you:
- Hide it by default to save space
- Enable it when needed via the column settings popover

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/POSDashboard.tsx` | Add `phone` to column defaults (false), add toggle in settings popover, conditionally render Phone column, add time display to Sale Number |
| `src/pages/SalesInvoiceDashboard.tsx` | Add `phone` to column defaults (false), add toggle in settings popover, conditionally render Phone column, add time display to Invoice Number |

---

## Technical Details

### Updated Default Column Settings

**POSDashboard.tsx:**
```typescript
const DEFAULT_POS_COLUMNS = {
  phone: false,  // NEW - hidden by default
  status: true,
  refund: true,
  refundStatus: true,
  creditNoteStatus: true,
  whatsapp: true,
  copyLink: true,
  preview: true,
  print: true,
  modify: true,
};
```

**SalesInvoiceDashboard.tsx:**
```typescript
const defaultColumnSettings: ColumnSettings = {
  phone: false,  // NEW - hidden by default
  status: true,
  delivery: true,
  whatsapp: true,
  copyLink: true,
  print: true,
  download: true,
  modify: true,
  delete: true,
};
```

### Time Display Pattern

The invoice number cell will include a time indicator:
```tsx
<TableCell className="font-medium">
  <div className="flex flex-col">
    <span>{sale.sale_number}</span>
    <span className="text-xs text-muted-foreground">
      {format(new Date(sale.sale_date), "HH:mm")}
    </span>
  </div>
</TableCell>
```

### Phone Column Visibility

**Table Header:**
```tsx
{columnSettings.phone && <TableHead>Phone</TableHead>}
```

**Table Cell:**
```tsx
{columnSettings.phone && (
  <TableCell>{sale.customer_phone || '-'}</TableCell>
)}
```

### Settings Popover Addition

Add phone toggle at the top of the Show/Hide Columns list:
```tsx
<div className="flex items-center justify-between">
  <Label htmlFor="col-phone" className="text-sm">Phone Number</Label>
  <Checkbox
    id="col-phone"
    checked={columnSettings.phone}
    onCheckedChange={(checked) => updateColumnSetting('phone', !!checked)}
  />
</div>
```

---

## Visual Result

**After Implementation:**

| □ | ▸ | Sale Number | Customer | Date | Qty | Amount | ... |
|---|---|-------------|----------|------|-----|--------|-----|
| □ | > | POS/25-26/8 | CASH SALES | 30/01/2026 | 1 | ₹170 | ... |
|   |   | *14:32* |  |  |  |  |  |

- Invoice number shows with time below it
- Phone column is hidden by default
- Users can enable Phone via the settings popover (⚙️ icon)

---

## Benefits

- **Time visibility**: Easily identify when invoices were created, useful for same-day auditing
- **Cleaner tables**: Phone column hidden by default removes visual clutter
- **User control**: Phone column can be enabled any time via Show/Hide Columns
- **Persistent settings**: Column preferences are saved per organization
