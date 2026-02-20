
# Fix: 40-Sheet 38×35mm Label Alignment

## Root Cause Analysis

Looking at the two printed photos and the code, there are **3 compounding issues** causing the misalignment:

### Issue 1 — Wrong Preset Dimensions (Primary Cause)

The user's physical label sheet has **38mm wide × 35mm tall** labels in a 5×8 grid (40 labels).

The closest built-in preset `novajet40` is defined as:
```
{ cols: 5, rows: 8, width: "35mm", height: "37mm", gap: "1.2mm" }
```

- Width is wrong: code uses 35mm, physical label is 38mm (3mm too narrow)
- Height is wrong: code uses 37mm, physical label is 35mm (2mm too tall)
- **This means every row is 2mm too tall** — across 8 rows that's a 16mm drift by the last row, which matches exactly what the photos show (labels slipping downward on the sheet by rows 6-8)

### Issue 2 — Row Overflow to Page 2

With the current `novajet40` height of 37mm and gap of 1.2mm, the `rowsPerPage` calculation is:
```
Math.floor((297 - 2 - 0 - 5) / (37 + 1.2)) = Math.floor(290 / 38.2) = 7 rows
```

But the physical sheet has 8 rows. So the system splits the print across **2 pages** — the first 35 labels (5×7) print on page 1, and the remaining 5 labels go to page 2. When the user prints, the second page starts fresh from the top of a new sheet, misaligning all remaining labels.

### Issue 3 — No Dedicated 38×35mm Preset

There is no exact `38×35mm` preset in the dropdown. Users must either use `novajet40` (wrong dimensions) or set up a Custom preset. The UI needs a clearly labeled preset for this exact sheet size.

---

## The Fix: 3 Changes

### Fix 1 — Add a new `a4_38x35_40sheet` preset (38×35mm, 5×8)

In `sheetPresets`, add an exact entry for the 38×35 sheet. The correct parameters:
- Width: 38mm (physical label width)
- Height: 35mm (physical label height)
- Cols: 5
- Rows: 8
- Gap: 1mm (standard gap for this sheet type)

With height=35mm and gap=1mm, the row calculation becomes:
```
Math.floor((297 - 2 - 0 - 5) / (35 + 1)) = Math.floor(290 / 36) = 8 rows ✓
```
All 8 rows fit on a single page — no overflow, no split.

### Fix 2 — Fix the `novajet40` preset to match real-world dimensions

The `novajet40` label in the dropdown currently says "39×35mm, 5×8" in the UI but is coded as 35×37mm. Fix it to be accurate: `width: "38mm", height: "35mm"`. This fixes it for all existing users who rely on this preset.

### Fix 3 — Add the new preset to the UI dropdown with a clear label

Add it to the "A4 - Medium Labels" group in the `SelectContent` dropdown with a clear description: **"A4 40-Sheet (38×35mm, 5×8)"**

---

## Files to Change

### `src/pages/BarcodePrinting.tsx`

**Change 1** — `sheetPresets` object (line ~210): Fix `novajet40` dimensions and add new `a4_40sheet` preset:

```typescript
// BEFORE:
novajet40: { cols: 5, rows: 8, width: "35mm", height: "37mm", gap: "1.2mm", category: "a4" },

// AFTER (fix novajet40 + add exact 38x35 preset):
novajet40: { cols: 5, rows: 8, width: "38mm", height: "35mm", gap: "1mm", category: "a4" },
a4_40sheet: { cols: 5, rows: 8, width: "38mm", height: "35mm", gap: "1mm", category: "a4" },
```

**Change 2** — `sheetPresetLabels` (line ~266): Update `novajet40` label and add `a4_40sheet`:

```typescript
novajet40: { label: "Novajet 40", description: "38×35mm, 5×8 (40 labels)", group: "A4 - Medium Labels" },
a4_40sheet: { label: "A4 40-Sheet", description: "38×35mm, 5×8 (40 labels)", group: "A4 - Medium Labels" },
```

**Change 3** — `SheetType` union type (line ~183): Add `"a4_40sheet"` to the type:

```typescript
type SheetType = 
  "novajet48" | "novajet40" | "a4_40sheet" | "novajet65" | ...
```

**Change 4** — UI dropdown `SelectContent` (line ~3410): Add the new preset item in the "A4 - Medium Labels" group:

```tsx
<SelectItem value="a4_40sheet">A4 40-Sheet (38×35mm, 5×8) ✓ Exact fit</SelectItem>
```

**Change 5** — Fix the `novajet40` auto-offset defaults (line ~1069): Since dimensions changed, keep the same defaults:

```typescript
novajet40: { defaultTop: 2, defaultLeft: 1 },
a4_40sheet: { defaultTop: 2, defaultLeft: 1 },
```

**Change 6** — Fix `handleCopyPresetToCustom` rowsMap (line ~2052): Update the rows entry:

```typescript
const rowsMap: Record<string, number> = {
  novajet48: 6,
  novajet40: 8,
  a4_40sheet: 8,   // add this
  novajet65: 13,
  a4_12x4: 12,
};
```

---

## Expected Result After Fix

| Before | After |
|---|---|
| novajet40 uses 35×37mm → 3mm narrow, 2mm too tall per label | novajet40 / a4_40sheet uses 38×35mm → exact physical match |
| 8 rows don't fit in A4, spills to page 2 | All 8 rows fit: `(297-7)/(35+1)=8.05` → exactly 8 rows per page |
| Labels drift downward by row 6-8 | Labels align perfectly across all 40 positions |
| No exact 38×35 preset in dropdown | Clear "A4 40-Sheet (38×35mm)" option in dropdown |

The fix is purely in the preset definitions — no changes to the print engine, CSS, or PDF logic needed.
