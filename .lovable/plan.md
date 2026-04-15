

## Roll-wise MTR: Product Entry Adaptation

When `roll_wise_mtr_entry` is enabled and a product's UOM is set to MTR, the Product Entry page should skip the size grid entirely — individual roll variants are created dynamically during Purchase Entry, not at product creation time.

### Current Problem
The screenshot shows that even for MTR products, the standard Size Grid appears with size columns (like "Free", "80"). For roll-wise MTR products, sizes represent individual roll lengths that are unknown until purchase time. The Size Group selector and size-wise variant generation are irrelevant.

### Changes

#### 1. `src/pages/ProductEntry.tsx` — Conditional Size Grid Skip for MTR Roll Products

- Read `roll_wise_mtr_entry` from the already-fetched `purchase_settings` (line ~390). Store in a state variable like `rollWiseMtrEnabled`.
- When `formData.uom === 'MTR'` AND `rollWiseMtrEnabled` is true:
  - **Hide** the Size Group dropdown selector
  - **Hide** the "Size-wise Quantity" grid section
  - **Change** the "Generate Variants" button behavior: generate one variant per color with size = "Roll" (placeholder), instead of color × size matrix
  - Show an info banner: "Roll-wise MTR mode: Individual roll variants with meter lengths will be created during Purchase Entry."
- The variant table still shows (COLOR, PUR PRICE, SALE PRICE, BARCODE, ACTIVE) but without the SIZE column — or SIZE shows "Roll" as a fixed label.

#### 2. Variant Generation Logic (`handleGenerateSizeVariants`)

- Add a branch at the top: if `rollWiseMtrEnabled && formData.uom === 'MTR'`:
  - Skip size group requirement
  - Create one variant per color with `size: "Roll"` (or empty)
  - Each gets a unique barcode
  - These serve as color placeholders; actual roll variants are added in Purchase Entry

#### 3. Size Group Selector Visibility

- Wrap the Size Group `<Select>` (around line 2079) in a condition: hide when `rollWiseMtrEnabled && formData.uom === 'MTR'`
- Similarly hide the "Size-wise Quantity" section and custom size input

### Technical Details
- No database changes needed
- Uses existing `purchase_settings.roll_wise_mtr_entry` flag already fetched in `fetchDefaultSizeGroup`
- Only affects Product Entry UI for organizations with the setting enabled AND products with UOM = MTR
- All other UOM products continue with standard size grid behavior unchanged

