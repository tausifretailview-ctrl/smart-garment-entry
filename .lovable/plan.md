

# Add "Print Test Label" Calibration Feature

## Overview
Add a dedicated "Print Test Label" button next to the existing print/calibrate buttons that prints a special alignment crosshair label (no product data) and auto-saves the calibration to the database.

## Changes

### 1. New Component: `TestLabelPrint`
**File**: `src/components/precision-barcode/TestLabelPrint.tsx`

A print-only component that renders an alignment crosshair label:
- Red vertical line at horizontal center
- Red horizontal line at vertical center
- Black "L" bracket at the (0,0) top-left corner
- "CENTER" text at the intersection point
- Label dimensions shown in small text at the bottom
- Uses `PrecisionPrintCSS` for clean print output (no browser headers)

### 2. Update `BarcodePrinting.tsx` -- Add Test Print Button and Logic

**Location**: Next to the existing "Print" and "Calibrate" buttons (around line 4330)

- Add a `testPrintRef` for the hidden test label print area
- Add a `handleTestPrint` function that:
  1. Auto-saves the current calibration (width, height, X/Y offsets) to the `printer_presets` table as an "Auto-Calibration" preset (upsert)
  2. Shows a toast confirming the save
  3. Triggers `window.print()` with the test label
- Render the `TestLabelPrint` component in a hidden div (same pattern as existing precision print area)
- Button appears only when Precision Pro mode is enabled (same condition as the Calibrate button)

### 3. Update `LabelCalibrationUI.tsx` -- Add Help Tooltip

Add a help tooltip next to the "Offsets & Gap" heading with calibration instructions:
> "Instructions: Print the Test Label. If the red crosshair is not centered on your sticker, use the X and Y offsets to nudge the print. Positive X moves right, positive Y moves down. 1mm = 1 unit."

Uses the existing Tooltip component from the UI library.

## Technical Details

- The test label renders using pure CSS absolute positioning in `mm` units, matching the existing Precision Pro approach
- Auto-save uses the same `supabase.from("printer_presets").upsert()` pattern already in the calibration dialog
- The preset is named based on the dimensions (e.g., "Auto-Cal 50x25mm") so repeated test prints update the same row
- Print isolation: the test label area uses the same `precision-print-area` class and `PrecisionPrintCSS` component for clean output

## Files
| Action | File |
|--------|------|
| Create | `src/components/precision-barcode/TestLabelPrint.tsx` |
| Modify | `src/pages/BarcodePrinting.tsx` |
| Modify | `src/components/precision-barcode/LabelCalibrationUI.tsx` |

