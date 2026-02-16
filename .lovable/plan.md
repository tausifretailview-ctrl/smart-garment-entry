

# Add Missing Color to Existing Product Variants

## Problem
When editing a product, variants that were created without a color show "-" in the Color column. There is no way to assign a color to these existing variants -- the color field is read-only text in the variants table.

## Solution
Make the Color column **editable** in the variants table so you can type or select a color for any variant, including ones that currently show "-".

## How It Will Work
1. Replace the read-only color text with a small **editable input field** in each variant row
2. When you type a new color (e.g., "RD") and press Enter or move away, the variant's color updates immediately
3. On saving the product, the updated color is persisted to the database
4. The color input will also show existing colors from `formData.colors` as suggestions via a dropdown/datalist, so you can quickly pick from already-used colors like "BK"
5. If you type a completely new color, it will also be added to the product's color list automatically

## Technical Changes

### File: `src/pages/ProductEntry.tsx`
- **Line ~2201**: Replace the static `{variant.color || '-'}` display with an `<Input>` field bound to `handleVariantChange(index, "color", value)`
- Add a `<datalist>` element populated from `formData.colors` to provide quick color suggestions
- When color is changed on a variant, if the new color is not already in `formData.colors`, add it automatically
- Protected variants (those with transactions) will still allow color editing since it does not break transaction integrity

### Validation
- Color values will be auto-uppercased for consistency
- Empty color (clearing the field) will be allowed (sets color back to blank)
- Duplicate color+size combinations will be checked to prevent conflicts

## What Stays the Same
- Generate Size Variants button still works as before
- Adding colors via the Color field above still generates new variant rows
- All barcode, price, and active toggle behavior unchanged
