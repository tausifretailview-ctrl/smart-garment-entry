

# Add Barcode Numbers & Improve Thermal Receipt Quality

## Problem
1. Thermal receipts don't show product barcode numbers, which are essential for sale returns
2. QR code for UPI payment needs to always show (when UPI is configured)
3. Font needs to be clearer, darker, and more standard-looking

## Changes

### 1. Update ThermalItem Interface (both components)
Add `barcode?: string` field to the `ThermalItem` interface in both `ThermalPrint80mm.tsx` and `ThermalReceiptCompact.tsx`.

### 2. Show Barcode Below Each Item (both components)
Display the barcode number in a smaller font below each item's name/qty row. This helps staff quickly identify products during sale returns.

**ThermalPrint80mm.tsx** - After the item name line, add:
```
{item.barcode && <div style={{ fontSize: '9px', color: '#333' }}>BC: {item.barcode}</div>}
```

**ThermalReceiptCompact.tsx** - Inside each table row, show barcode below description:
```
{item.barcode && <div style={{ fontSize: '8px' }}>BC: {item.barcode}</div>}
```

### 3. Pass Barcode Data from InvoiceWrapper
Update `InvoiceWrapper.tsx` (around line 343) to include `barcode` in the items mapping:
```typescript
items={props.items.map((item, idx) => ({
  sr: idx + 1,
  particulars: item.particulars,
  barcode: item.barcode,  // ADD THIS
  qty: item.qty,
  rate: item.rate,
  total: item.total,
}))}
```

### 4. Improve Font Clarity & Darkness

**ThermalPrint80mm.tsx:**
- Change font to `'Arial, Helvetica, sans-serif'` (cleaner than Courier for thermal)
- Increase base `fontWeight` to 800
- Set `color: '#000000'` consistently
- Add `-webkit-text-stroke: 0.3px #000` for extra darkness on thermal printers

**ThermalReceiptCompact.tsx:**
- Increase base `fontWeight` to 700
- Add `-webkit-text-stroke: 0.2px #000` for crispness
- Ensure all text uses pure `#000` (no `#888` or `#ccc`)

### 5. Ensure QR Code Always Shows (when UPI configured)
Both components already generate UPI QR codes when `upi_id` is configured and `grandTotal > 0`. No changes needed here -- QR code functionality is already working.

## Files Modified
- `src/components/ThermalPrint80mm.tsx` -- Add barcode display, improve font darkness
- `src/components/ThermalReceiptCompact.tsx` -- Add barcode display, improve font darkness
- `src/components/InvoiceWrapper.tsx` -- Pass barcode field to thermal components

