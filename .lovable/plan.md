

## Add Barcode Column to Sales Dashboard Product Details

**Current Behavior**: The expanded product details in the Sales Invoice Dashboard have a "Barcode" column, but it's hidden by default. It's controlled by a setting (`show_item_barcode`) in Settings > Sale Settings, which defaults to `false`.

**Solution**: Change the default value of `showItemBarcode` from `false` to `true` so the barcode column appears by default in the expanded item rows on the Sales Invoice Dashboard.

---

### Technical Details

**File**: `src/pages/SalesInvoiceDashboard.tsx` (line 415)

Change:
```typescript
const showItemBarcode = saleSettings?.show_item_barcode ?? false;
```
To:
```typescript
const showItemBarcode = saleSettings?.show_item_barcode ?? true;
```

This single-line change will make the Barcode column visible by default in the expanded product details table. Users can still toggle it off via Settings > Sale Settings > Barcode checkbox if desired.

**Note**: The barcode data (`item.barcode`) is already being fetched from `sale_items` -- no database or query changes are needed.

