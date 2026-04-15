

## Apply Roll-wise MTR Logic to ProductEntryDialog

The roll-wise MTR changes were only applied to the standalone `ProductEntry.tsx` page, but the "Purchase Bill — Add New Product" dialog (`src/components/ProductEntryDialog.tsx`) is a separate component that lacks these changes. This is what the user sees in their screenshot.

### Changes

#### `src/components/ProductEntryDialog.tsx`

1. **Add state**: `const [rollWiseMtrEnabled, setRollWiseMtrEnabled] = useState(false);`

2. **Read setting** (line ~629, inside the `purchase_settings` block): Add `setRollWiseMtrEnabled(purchaseSettings.roll_wise_mtr_entry || false);`

3. **Derive flag**: `const isRollWiseMtr = rollWiseMtrEnabled && formData.uom === 'MTR';`

4. **Hide Size Group selector** (line ~1773): Add `&& !isRollWiseMtr` to the condition:
   ```
   {formData.product_type !== 'service' && !mobileERPMode?.locked_size_qty && !isRollWiseMtr && (
   ```

5. **Hide Size-wise Quantity grid**: Find the size-wise quantity section and wrap with `!isRollWiseMtr`

6. **Update `handleGenerateSizeVariants`** (line ~736): Add a branch after the service check:
   ```typescript
   if (isRollWiseMtr) {
     const colorsToUse = formData.colors.length > 0 ? formData.colors : [""];
     const newVariants = colorsToUse.map(color => ({
       color,
       size: "Roll",
       pur_price: formData.default_pur_price ?? 0,
       sale_price: formData.default_sale_price ?? 0,
       mrp: formData.default_mrp ?? null,
       barcode: "",
       active: true,
       opening_qty: 0,
     }));
     if (isAutoBarcode) autoBarcodePending.current = true;
     setVariants([...variants, ...newVariants]);
     setShowVariants(true);
     return;
   }
   ```

7. **Add info banner** before the variants section when `isRollWiseMtr`:
   - "Roll-wise MTR mode: Individual roll variants with meter lengths will be created during Purchase Entry."

8. **Update Generate button label**: Show "Generate Color Variants" when `isRollWiseMtr`, disable size group requirement

### No other files affected
This mirrors the exact same logic already working in `ProductEntry.tsx`, applied to the dialog variant.

