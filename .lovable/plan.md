

# Precision Pro Label Calibration UI Enhancement

## Overview
The Precision Pro system already exists with all the core features (absolute mm positioning, field customization, thermal/A4 modes, SVG barcodes, label designer). This plan enhances the calibration experience by adding a dedicated `LabelCalibrationUI` component with nudge buttons and sliders, and adding a preset save/load system for calibration profiles.

## What Changes

### 1. New Component: `LabelCalibrationUI.tsx`
A polished calibration panel replacing the plain number inputs in Settings. For each calibration value (X-Offset, Y-Offset, Vertical Gap, Label Width, Label Height):
- **Slider** for smooth adjustment (range-appropriate, e.g. -10 to +10mm for offsets, 10-100mm for dimensions)
- **Nudge buttons** (+0.5mm / -0.5mm) flanking the numeric input for fine-tuning
- **Current value display** in mm
- Live preview of a sample label that updates as values change

### 2. Calibration Presets
- "Save Preset" button that stores the current calibration values (offsets + dimensions) as a named preset
- "Load Preset" dropdown to recall saved presets
- Presets stored in the existing `bill_barcode_settings` JSON column as `precision_presets` array
- Common built-in presets: "50x25mm Thermal", "38x25mm Jewellery", "100x50mm Shipping"

### 3. Integration
- Replace the plain input fields in Settings.tsx Precision Pro section with the new `LabelCalibrationUI` component
- Also embed a compact version in the BarcodePrinting page for quick adjustments before printing

## Files to Create
1. `src/components/precision-barcode/LabelCalibrationUI.tsx` -- Calibration panel with sliders, nudge buttons, presets, and live preview

## Files to Modify
1. `src/pages/Settings.tsx` -- Replace plain offset/dimension inputs with the new `LabelCalibrationUI` component
2. `src/pages/BarcodePrinting.tsx` -- Add a compact calibration panel accessible via a "Calibrate" button

## Technical Details

### Nudge Button Pattern
```text
[ -0.5 ] [ input: 2.5 mm ] [ +0.5 ]
|=========[====]==================| slider
```

Each field row contains: minus button, numeric input, plus button, and a slider below. Clicking nudge buttons adjusts value by 0.5mm. Slider provides continuous adjustment.

### Presets Data Shape
```text
precision_presets: [
  { name: "50x25 Thermal", xOffset: 0, yOffset: 0, vGap: 2, width: 50, height: 25 },
  { name: "38x25 Jewellery", xOffset: 1, yOffset: 0.5, vGap: 1, width: 38, height: 25 }
]
```

### No Database Migration Needed
All data is stored in the existing `bill_barcode_settings` JSON column, which already holds precision settings.

