

# Fix Thermal Label: Margins, Double Labels, and Unwanted Content

## Issues Found

### 1. Margins only affect 1st label (thermal print mode)
**Root cause**: In the print-mode branch (line 2835-2849), thermal 1UP grids are created with `padding: 0; margin: 0` hardcoded. The user's margin settings (`topOffset`, `leftOffset`, `bottomOffset`, `rightOffset`) are only applied in the A4 grid branch (line 2856-2858). So from the 2nd label onward, margins are completely ignored.

**Fix**: Apply user margins as padding on each thermal label grid container in print mode.

### 2. Preview shows double the labels (e.g., 10 qty shows 20)
**Root cause**: The preview mode (line 2708) always uses A4-based pagination logic even for thermal 1UP labels. It calculates `rowsPerPage = floor(286 / 25) = 11` and creates a grid with `grid-template-rows: repeat(11, 25mm)`. This means for 10 labels, the grid creates 11 empty slots -- and the grid visually renders all 11 rows even though only 10 are filled, making it look like extra blank labels appear. For larger quantities, this pagination creates multiple pages each with empty trailing slots, inflating the visible count.

**Fix**: Add a thermal-specific branch in preview mode that shows 1 label per row (simple list), matching what the printer will actually output. For thermal 1UP, `labelsPerPage` should equal 1 per row, and the grid should use `grid-template-rows` matching only the actual labels placed (not the calculated rows from A4 height).

### 3. Unwanted content: timestamp and URL in print
**Root cause**: Chrome's default print headers/footers add the page title ("EzzyERP - Easy Billing, Smart Business"), timestamp ("2/26/26, 1:48 PM"), and page URL at the top and bottom of each printed page. These appear when the `@page` margin is 0 but Chrome still reserves space for them unless the user manually unchecks "Headers and footers" in the print dialog.

**Fix**: We already have `@page { margin: 0 }` which should suppress these. The remaining fix is to temporarily set `document.title` to an empty string before printing and restore it after, so even if Chrome shows headers, they'll be blank. Also add a note/tooltip instructing users to uncheck "Headers and footers" in Chrome's print settings.

## Technical Changes

### File: `src/pages/BarcodePrinting.tsx`

**Change 1: Apply margins to thermal labels in print mode (lines 2835-2849)**

Add padding from user margins to each thermal grid container:
```typescript
gridDiv.style.cssText = isThermal1Up()
  ? `
      display: block;
      width: ${dimensions.width}mm;
      height: ${dimensions.height}mm;
      ...
      padding-top: ${topOffset}mm;
      padding-left: ${leftOffset}mm;
      padding-bottom: ${bottomOffset}mm;
      padding-right: ${rightOffset}mm;
    `
```

Also update the `@page` size to account for margins (add margin space to page dimensions) and update the `@media print` `#printArea .label-grid` width/height to include margins.

**Change 2: Fix preview pagination for thermal 1UP (lines 2692-2696, 2708-2811)**

Add a thermal-specific branch in preview mode:
```typescript
if (isPreviewMode) {
  if (isThermal1Up()) {
    // For thermal 1UP, each label is a separate "page" - show them in a simple list
    labelsPerPage = 1;
    numPages = totalLabels;
  } else {
    // A4 pagination
    ...
  }
}
```

And in the preview rendering, for thermal 1UP, use `grid-template-rows: repeat(1, ${height}mm)` instead of `repeat(rowsPerPage, ...)` to show exactly 1 label per page block.

**Change 3: Suppress browser headers/footers during print (line 2919-2927)**

In `handlePrint`, temporarily clear `document.title` before `window.print()` and restore after:
```typescript
const handlePrint = () => {
  generatePreview("printArea");
  const originalTitle = document.title;
  document.title = ' ';  // Blank title suppresses header text
  setTimeout(() => {
    window.print();
    document.title = originalTitle;  // Restore after print
  }, 50);
};
```

## Summary
- 3 changes in `src/pages/BarcodePrinting.tsx`
- Thermal margins applied to every label (not just 1st)
- Preview correctly shows 1 label per page for thermal
- Browser header/footer text suppressed during printing
