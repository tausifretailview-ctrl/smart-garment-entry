# NovaJet 40L label alignment fix (Al Nisa Couture)

## What is wrong

Al Nisa's saved barcode settings do not match the NovaJet MPL 40L die-cut sheet, and one print path ignores the correction the app already has.

Their stored defaults (from the org's barcode settings):
- Default sheet preset "NEW 40": 38 x 35 mm, 5 cols x 8 rows, **gap 1 mm**
- Another saved preset "40 label sheet": 40 x 35 mm, gap 2 mm (5 x 40 + 4 x 2 = 208 mm wide — wider than A4's printable area)
- Default margin preset "40": top 0, left 1, bottom 1, right 1

The real MPL 40L sheet is **39 x 35 mm, 5 x 8, gap 0**, top margin 8.5 mm, left margin 7.5 mm.

With gap 1 the row pitch becomes 36 mm instead of 35 mm, so each row drifts ~1 mm lower; by the 8th row the label is ~7 mm off — which matches the photos (top rows near-correct, lower rows sliding off the die-cut, some cells blank).

The app already coerces this case (`resolveA4LayoutGap` / `resolveA4LabelWidthMm` force 39 x 35 / gap 0) on the screen preview and browser print path, but:
1. The coercion only recognises widths of exactly 38 or 39 mm — the "40 label sheet" preset (40 mm, gap 2) escapes it entirely.
2. The **PDF export path** in Barcode Printing builds its grid from the raw custom values and additionally applies an auto-fit shrink, so PDF output is misaligned even when the on-screen preview looks right.

## Fix

1. **Widen 40L detection** (`src/utils/a4SheetLayout.ts`): treat any 5 x 8 grid with width 38-40 mm and height 34-36 mm as MPL 40L, and coerce it to 39 x 35 mm with gap 0 and the official 8.5 / 7.5 mm sheet margins. Same guard already exists for 48L.
2. **Apply the coercion in the PDF export path** (`src/pages/BarcodePrinting.tsx`, PDF branch around the `getAutoFitScale` usage): use `getA4SheetDimensions()` (which is already coerced) instead of the raw `customWidth/customHeight/customGap`, and skip auto-fit shrink for recognised A4 die-cut sheets so the pitch stays exactly at the die-cut.
3. **Correct the org's saved data** for Al Nisa Couture: update the "NEW 40" sheet preset to 39 x 35 gap 0, fix "40 label sheet" the same way, and set the default margin preset offsets to 0/0/0/0 (the die-cut margins are built in, the +1 mm left/bottom nudge was compensating for the pitch error).
4. Add unit cases to `src/utils/a4SheetLayout.test.ts` for the 40 mm / gap 2 variant.

## Printer-side note

The user must also print at **100% / Actual size** (not "Fit to page") with paper set to A4 — Fit-to-page re-scales the sheet and no software margin can compensate for it.
