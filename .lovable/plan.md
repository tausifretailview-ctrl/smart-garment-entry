## Goal

In Standard Printing (A4 sheet) only, add a new field "Start Label Position" so the user can begin printing from label slot N (e.g. 11) when labels 1–10 are already used on the sheet. Default = 1 (normal behavior, no skip). No other settings change.

## Behavior

- Field appears only in the Standard Printing tab (A4 sheets). Thermal 1UP/2UP unaffected.
- Default value = 1 → prints normally from slot 1.
- If user enters N (1 ≤ N ≤ cols × rows): the first (N − 1) slots on page 1 are left blank, real labels start at slot N. Subsequent pages start at slot 1 as usual.
- Applies to both "Print" (PDF print flow) and "Perfect PDF" export, and to the on-screen `PrecisionA4SheetPrint` preview so what user sees matches what prints.
- Field resets to 1 after print is optional — keep value sticky in component state (not persisted to DB) so user controls it.

## Files to edit

1. **`src/utils/a4LabelPdf.ts`**
   - Add `startPosition?: number` to `A4SheetOptions` (default 1).
   - In page 1 layout, offset the first page's labels by `(startPosition − 1)` empty slots: build `allLabels` then prepend `(startPosition − 1)` `null` placeholders; in the per-label loop, skip rendering when item is null but still consume the slot.

2. **`src/components/precision-barcode/PrecisionA4SheetPrint.tsx`**
   - Add optional `startPosition?: number` prop (default 1).
   - On the first page only, prepend `(startPosition − 1)` empty grid cells (render an empty `<div style={{ width: labelWidth+'mm', height: labelHeight+'mm' }} />`) before the real labels so the preview matches the printed offset.

3. **`src/pages/BarcodePrinting.tsx`**
   - Add state: `const [startPosition, setStartPosition] = useState(1);`
   - In the Standard Printing tab UI (near top/left offset inputs), add a small numeric input "Start Label Position" with min=1, max = `cols * rows`, helper text "Skip already-used labels on the sheet (default 1).".
   - Pass `startPosition` into both `generateA4LabelPdf(...)` calls (lines ~3629 and ~3746) and into both `<PrecisionA4SheetPrint ... />` usages (lines ~5778 and ~5886).
   - Do NOT persist into printer_presets or default formats — keep it ephemeral per-session.

## Out of scope

- No changes to thermal printing, label design, search, RPCs, DB, or any other setting.
- No default-format save/load changes.
