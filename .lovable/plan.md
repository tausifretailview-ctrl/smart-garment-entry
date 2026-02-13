
## Inline Sale Return in POS -- Floating Return Window

### What This Does
Adds a "Sale Return" button to the POS screen that opens a floating dialog window. Inside this dialog, you can scan/search returned products, save the return, and the return amount automatically fills into the S/R Adjusted field. Then you scan new products the customer is taking, and the return amount is adjusted against the new sale total.

### User Flow

```text
1. Customer brings old product to return
2. Click "S/R" button in POS bottom bar (mobile) or header (desktop)
3. Floating dialog opens with barcode scanner + product search
4. Scan returned product(s) --> items appear in return list
5. Click "Save Return" --> return is saved to database
6. Dialog closes, return amount auto-fills into S/R Adjust field
7. Scan new products customer is taking
8. Final amount = New Sale Total - S/R Adjusted Amount
```

---

### Changes

**New File: `src/components/FloatingSaleReturn.tsx`**

A floating dialog component containing:
- Barcode scanner input (auto-focused)
- Product search popover (only sold products, reusing existing pattern from SaleReturnEntry)
- Return items table with quantity +/- and remove buttons
- Total display
- "Save Return" button that:
  - Generates a sale return number via `generate_sale_return_number` RPC
  - Inserts into `sale_returns` and `sale_return_items` tables
  - Fetches original sale price from `sale_items.per_qty_net_amount` (with fallback)
  - Returns the net amount to the parent via callback
- "Cancel" button to close without saving

Props:
- `open: boolean`
- `onOpenChange: (open: boolean) => void`
- `organizationId: string`
- `customerId?: string` (auto-passed from current POS customer)
- `customerName?: string`
- `onReturnSaved: (returnAmount: number, returnNumber: string) => void`

**Modified File: `src/pages/POSSales.tsx`**

- Add state: `showFloatingSaleReturn`
- Import and render `FloatingSaleReturn` dialog
- On `onReturnSaved` callback: set `saleReturnAdjust` to the returned amount, show success toast
- Wire up the button to open the dialog

**Modified File: `src/components/mobile/MobilePOSBottomBar.tsx`**

- Add a "S/R" (Sale Return) button in the bottom bar, replacing one of the existing layout options or adding it to the "More" sheet
- On click: call `onSaleReturn` callback

**Modified File: `src/components/mobile/MobilePOSLayout.tsx`**

- Pass through `onSaleReturn` and `showFloatingSaleReturn` props

**Modified File: `src/components/mobile/MobilePOSPaymentSheet.tsx`**

- Add "Sale Return" option in the payment sheet's "More" actions

**Modified File: `src/components/POSLayout.tsx` (Desktop)**

- Add a "Sale Return" button in the header toolbar (next to existing buttons like New Sale, Clear, Cashier, Stock)

---

### Technical Details

**Return item pricing logic** (reused from SaleReturnEntry):
- Query `sale_items` for `per_qty_net_amount` (post-migration sales with proportional discount)
- Fall back to `line_total / quantity` for legacy sales
- Final fallback to `variant.sale_price`

**Database operations** (same tables as SaleReturnEntry):
- `sale_returns` -- header record with return number, customer, amounts
- `sale_return_items` -- line items with product, variant, quantity, unit price

**Amount flow:**
- After saving the return, the return's `net_amount` is passed back to POSSales
- POSSales sets `saleReturnAdjust = returnAmount`
- The existing formula already handles it: `finalAmount = subtotal - flatDiscount - saleReturnAdjust + roundOff`

**Desktop POS:** The existing S/R Adjust input field (line ~3325-3334) will be auto-populated but remains editable for manual override.

**Mobile POS:** The "Sale Return" option will be available in the "More" payment sheet to keep the bottom bar clean.
