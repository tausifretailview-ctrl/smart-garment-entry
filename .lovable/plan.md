

# POS Quick Service Product Entry (Shortcode 1, 2, 3...)

## Overview
Add a fast-entry system for service products in POS. When the user types a short numeric code (like "1", "2", "3") and presses Enter, a compact dialog appears asking for Quantity and MRP. On confirm, the product is added to the cart instantly. This allows rapid billing of service items (alterations, stitching, loose items) without needing full barcode lookups.

## How It Works

1. User types "1" in the barcode field and presses Enter
2. System detects it as a quick-service shortcode (single digit 1-9)
3. A compact dialog opens showing "Service Product 1" with fields for Qty and MRP
4. User enters Qty (e.g. 1) and MRP (e.g. 500), presses Enter or clicks Add
5. Item is added to the cart as a service line item (no stock deduction)
6. Focus returns to barcode input for next scan

## Changes

### 1. New Component: `src/components/QuickServiceProductDialog.tsx`
A small, focused dialog with:
- Title showing the shortcode number (e.g. "Quick Service Item #1")
- Quantity input (default 1, auto-focused on MRP field since qty is usually 1)
- MRP input (auto-focused for speed)
- Enter key submits the form
- ESC closes without adding

### 2. Modified File: `src/pages/POSSales.tsx`

**New state variables:**
- `showQuickServiceDialog` (boolean)
- `quickServiceCode` (string - the shortcode entered)

**Modified `searchAndAddProduct` function:**
Before the existing barcode/name search logic, add a check:
- If the search term is a single digit "1" through "9", open the QuickServiceProductDialog instead of searching products
- This intercepts before any "Product not found" error

**New handler `handleQuickServiceAdd`:**
- Receives `{ code, quantity, mrp }` from the dialog
- Creates a CartItem with:
  - `productName`: "Service Item {code}" (or configurable name)
  - `productType`: "service"
  - `quantity`: user-entered qty
  - `mrp`: user-entered MRP
  - `unitCost`: same as MRP
  - `netAmount`: qty * MRP
  - Unique ID using timestamp (same pattern as existing service products)
  - No stock validation (service product)
- Adds to cart, plays success beep, closes dialog, refocuses barcode input

## Technical Details

**QuickServiceProductDialog props:**
```
interface QuickServiceProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceCode: string;
  onAdd: (data: { code: string; quantity: number; mrp: number }) => void;
}
```

**Cart item creation** follows the existing service product pattern from `addItemToCart`:
- Unique ID: `service-{code}-{timestamp}-{random}`
- `productType: 'service'`
- No `variantId` or `productId` (empty strings)
- `barcode`: the shortcode itself
- `gstPer`: 0 (or organization default)
- `discountPercent`: 0

**Shortcode detection** in `searchAndAddProduct`:
```
if (/^[1-9]$/.test(searchTerm)) {
  setQuickServiceCode(searchTerm);
  setShowQuickServiceDialog(true);
  setSearchInput("");
  return;
}
```

**Mobile support**: The same logic flows through `onBarcodeSubmit` in `MobilePOSLayout`, so it works on mobile POS too without additional changes.

## Files Changed
1. **New**: `src/components/QuickServiceProductDialog.tsx` - Dialog component
2. **Modified**: `src/pages/POSSales.tsx` - Add shortcode detection, state, and handler

