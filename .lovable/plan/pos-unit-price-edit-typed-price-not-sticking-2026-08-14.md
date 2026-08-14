# POS Unit Price edit — typed price not sticking

## What I found

The right is wired correctly (Settings → Sale flag + `pos_edit_unit_price` right + admin/manager bypass), and 4 organisations have the flag ON. The failures are in the cart cell itself:

1. **Typed price above MRP is silently discarded.** The mutator clamps `unitCost = min(mrp, typed)`. If the line's MRP equals the sale price (the common case when the barcode price mode is sale-price), any higher rate the cashier types snaps straight back with no message — it looks like "price not updating".
2. **Lines that already carry a discount have no input at all.** When Disc% or Disc Rs is non-zero (including auto-applied product/brand discounts), the Unit Price cell renders as static text, so the cashier can type nothing. This is invisible — the cell just looks different on some rows.
3. **After the high-discount confirmation dialog, the cell keeps showing the old typed draft** instead of the committed cart value, so even a successful override can look like it did not apply.

## The fix

- Allow the typed rate to go **above** MRP: keep the value as entered, and treat it as the line rate (no implicit rate discount, no negative discount). Only clamp at zero. Keep the existing minimum check for the bill discount cap.
- If the org prefers a hard MRP ceiling, keep the clamp but show a toast saying the price was reduced to MRP — never silently.
- **Always render the editable input** when the user has the right. If the line has Disc% / Disc Rs, still allow typing a unit price; committing it clears the line discounts, exactly as the existing unit-authority rule already specifies. Keep the small "list rate / -x%" caption next to the input so the discount context is not lost.
- Clear the draft state after the confirmation dialog commits, so the cell reflects the cart.

## Technical notes

- `src/lib/posBilling/cartMutators.ts` → `updatePrice`: drop / soften the `Math.min(mrp, raw)` clamp; keep `minUnitPriceForDiscountCap` rejection.
- `src/pages/POSSales.tsx` → `requestUnitPriceCommit` has the same duplicated clamp; keep it in sync.
- `src/pages/POSSales.tsx` unit-price cell (~line 6520): move the `hasLineDisc` branch so it no longer bypasses the `canEditPosUnitPrice` input.
- Confirm-dialog handler (~line 5202): `setUnitPriceDraft(null)` on success.
- Update `src/lib/posBilling/posBilling.characterisation.test.ts` for the above-MRP case; run the money tests.

## Decision needed

Should a typed rate be allowed **above MRP** (recommended — cashiers negotiate up on some SKUs), or stay capped at MRP with a visible toast?
