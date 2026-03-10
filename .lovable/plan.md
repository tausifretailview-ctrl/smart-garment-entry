

# Remove per-size price inputs from Purchase Size Grid

## Problem
In the Purchase Entry size grid dialog, each size shows an individual price input below the quantity input (visible in the screenshot as "181.65" under every size). This is unnecessary for purchase entry and clutters the UI.

## Solution
Add a `showSizePrices` prop (default `true`) to `SizeGridDialog`. Pass `showSizePrices={false}` from `PurchaseEntry.tsx`. Hide the per-size price inputs and the "Sale Price (editable per size above)" label when this prop is `false`.

## Changes

### 1. `src/components/SizeGridDialog.tsx`
- Add `showSizePrices?: boolean` to the props interface (default `true`)
- **Multi-color mode** (lines 583-596): Wrap the per-size price `<input>` in a `{showSizePrices && ...}` conditional
- **Single-color mode** (lines 903-913): Same — wrap the per-size price `<input>` in `{showSizePrices && ...}`
- **"Sale Price" label section** (lines 1044-1058): Wrap in `{showSizePrices && ...}`

### 2. `src/pages/PurchaseEntry.tsx`
- Add `showSizePrices={false}` to the `<SizeGridDialog>` usage (line ~3041)

No other files affected. Sales entry will continue showing per-size prices as before (default `true`).

