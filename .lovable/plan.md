

# Price Selection Dialog for Sales Invoice (Barcode Scan)

## Problem
When barcode `0090001151` is scanned in **Sales Invoice**, the system silently uses the master price (₹9000) without showing a choice dialog — even though the last purchase recorded a different price (₹8650). The **POS module** already handles this correctly with a `PriceSelectionDialog`, but Sales Invoice lacks this feature.

## Root Cause
In `src/pages/SalesInvoice.tsx`, the `addProductToInvoice` function compares `lastPurchaseSalePrice` vs `masterSalePrice` but never opens the `PriceSelectionDialog`. It only auto-applies customer price memory silently. The dialog component and its state management are completely absent from this page.

## Plan

### File: `src/pages/SalesInvoice.tsx`

**1. Add imports**
- Import `PriceSelectionDialog` from `@/components/PriceSelectionDialog`

**2. Add state variables** (alongside existing state declarations)
- `showPriceSelectionDialog` — boolean
- `pendingPriceSelection` — object holding product, variant, masterPrice, lastPurchasePrice, and customerPrice

**3. Update `addProductToInvoice` logic** (around lines 1136–1170)
- After computing `masterSalePrice`, `lastPurchaseSalePrice`, and `customerPrice`:
  - If no `overridePrice` is provided AND (`lastPurchaseSalePrice` differs from `masterSalePrice` OR `customerPrice` differs), store pending selection and open dialog instead of auto-applying
  - If customer price memory is enabled and no conflict exists, continue auto-applying as before

**4. Add `handlePriceSelection` handler**
- On user selection from dialog, call `addProductToInvoice` with the chosen price as `overridePrice`
- Clear pending state and close dialog

**5. Render `PriceSelectionDialog` in JSX**
- Add the dialog component at the bottom of the JSX (same pattern as POS), passing `masterPrice`, `lastPurchasePrice`, `customerPrice`, product name, and size

### No other files changed
The `PriceSelectionDialog` component already supports all three price sources (master, last_purchase, customer). No modifications needed there.

