

## Roll-wise MTR Entry Feature

Fabric/textile businesses need to track individual rolls with specific meter lengths (e.g., Black: 76 MTR, 81 MTR; Cream: 77, 74, 90, 66 MTR). Each roll becomes its own variant with a unique barcode — identical to the existing IMEI "Unit-as-Variant" architecture but for meter-based rolls.

## How It Works

When enabled (per-organization setting), products with UOM = MTR will show a **Roll Entry dialog** instead of the standard size grid. The user enters individual roll lengths per color. Each roll creates a unique `product_variant` row with its own barcode and `stock_qty` matching the roll length.

From the handwritten bill example:
- Product: FLEXI NL
- White: 76, 81 → 2 rolls, 2 variants
- Cream: 77, 74, 90, 66 → 4 rolls, 4 variants  
- Sky: 85 → 1 roll, 1 variant
- Total: 7 rolls, 549 MTR

## Changes

### 1. Add Setting: `PurchaseSettings.roll_wise_mtr_entry`

**File: `src/pages/Settings.tsx`**
- Add `roll_wise_mtr_entry?: boolean` to the `PurchaseSettings` interface
- Add a new checkbox in the Purchase tab (after the `size_grid_review_mode` section):
  - Label: "Roll-wise Entry for MTR Products"
  - Description: "When enabled, products with UOM = MTR show a roll entry dialog where each roll's individual meter length is entered. Each roll gets its own barcode and variant for per-roll stock tracking."

### 2. Create `RollEntryDialog` Component

**New file: `src/components/RollEntryDialog.tsx`**

A dialog similar to `IMEIScanDialog` but for roll lengths:
- **Header**: Product name, total rolls count, total meters
- **Per-color sections**: Each color gets its own group
- **Input rows**: One number input per roll (e.g., "76", "81"), with `+ Add Roll` button per color
- **Auto-barcode**: Each roll gets a unique barcode via `generate_next_barcode` RPC
- **Variant creation**: Each roll creates a `product_variant` with:
  - `size`: The roll length as string (e.g., "76")
  - `color`: The selected color
  - `barcode`: Auto-generated unique barcode
  - `stock_qty`: 0 (stock added via purchase_items trigger)
- **Summary footer**: Shows "7 Rolls · 549 MTR · ₹23,607" style totals
- **Enter key**: Advances focus to next input (same as IMEI pattern)

### 3. Integrate into Purchase Entry

**File: `src/pages/PurchaseEntry.tsx`**
- Read `roll_wise_mtr_entry` from `settings.purchase_settings`
- When a product is selected with UOM = MTR and `roll_wise_mtr_entry` is enabled:
  - Instead of showing `SizeGridDialog`, show `RollEntryDialog`
  - Pass the product's colors (from existing variants or the product itself)
  - On confirm: create variants and add line items (one per roll, qty = roll_length in MTR)
- The confirm handler follows the same pattern as `handleIMEIScanConfirm`:
  - Create `product_variant` per roll with unique barcode
  - Add one `LineItem` per roll with `qty` = roll meter length

### 4. Line Item Display

Each roll appears as a separate line in the purchase bill:
- Product: FLEXI NL | Color: BLACK | Size: (roll barcode) | Qty: 76 | Rate: 43 | Amount: 3,268

## Technical Details

- **Setting scope**: Per-organization, stored in `organization_settings.purchase_settings.roll_wise_mtr_entry`
- **UOM check**: Only triggers for products where `products.uom = 'MTR'`
- **No schema changes**: Uses existing `product_variants` table — each roll is a variant with its meter length stored as size
- **Barcode**: Uses existing `generate_next_barcode` RPC for auto-generation
- **Existing orgs unaffected**: Setting defaults to `false`, so all current size-wise logic continues unchanged
- **Stock tracking**: Each roll variant tracks its own stock (0 or roll_length after purchase)

