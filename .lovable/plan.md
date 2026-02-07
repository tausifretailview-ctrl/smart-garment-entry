

# Fix: Ella Noor TSC DA 310 Printer Label Alignment (50×38mm Direct Print)

## Problem Analysis

From the uploaded image, the labels are printing **upside down** (rotated 180°). Looking at the printed output:
- Text "ELLA NOOR", "KH-M0294-3", "10", "Rs. 3400" appears inverted
- Content is in reverse orientation from what the preview shows

## Root Causes Identified

| Issue | Current Setting | Required for TSC DA 310 |
|-------|-----------------|------------------------|
| **Print Direction** | `DIRECTION 0` (head to feed) | `DIRECTION 1` (reverse orientation) |
| **DPI Assumption** | 203 DPI (8 dots/mm) | 300 DPI (12 dots/mm) for DA 310 |
| **Gap Mode** | Already fixed to `GAP 0` | Correct for continuous |

### Why DIRECTION 1?

Looking at the PRN sample templates in `prnTemplateParser.ts`, they all use `DIRECTION 1`:
```
SIZE 50 mm, 25 mm
GAP 2 mm, 0 mm
DIRECTION 1     ← All sample templates use DIRECTION 1
CLS
```

But the TSPL generator at line 189 hardcodes `DIRECTION 0`:
```typescript
commands.push('DIRECTION 0');  ← This causes upside-down printing!
```

### Why 300 DPI Matters?

The TSC DA 310 is a 300 DPI printer. The current code uses 203 DPI (8 dots/mm), but should use 300 DPI (12 dots/mm):
- **203 DPI**: 8 dots per mm (most common desktop printers)
- **300 DPI**: 12 dots per mm (TSC DA 310, higher resolution)

If we use wrong DPI, all positions and sizes will be scaled incorrectly.

## Solution

### Approach: Add DPI and Direction Configuration to TSPLLabelConfig

Extend the configuration to support:
1. **DPI setting** - Default 203, but 300 for DA 310
2. **Direction setting** - Default 1 (most common), with option for 0

### Files to Modify

| File | Change |
|------|--------|
| `src/utils/tsplGenerator.ts` | Add `dpi` and `direction` to TSPLLabelConfig interface; use them in generation |
| `src/components/DirectPrintDialog.tsx` | Set `direction: 1` and `dpi: 300` for custom sizes (Ella Noor uses custom) |

### Technical Implementation

#### 1. Update TSPLLabelConfig Interface

```typescript
export interface TSPLLabelConfig {
  width: number;    // in mm
  height: number;   // in mm
  gap: number;      // gap between labels in mm
  dpi?: number;     // printer DPI (default: 203, use 300 for TSC DA 310)
  direction?: 0 | 1; // print direction (default: 1)
}
```

#### 2. Update generateTSPLLabelFromTemplate Function

```typescript
export const generateTSPLLabelFromTemplate = (
  labelConfig: TSPLLabelConfig,
  templateConfig: TSPLTemplateConfig,
  data: LabelData,
  copies: number = 1
): string => {
  const commands: string[] = [];
  const dpi = labelConfig.dpi || 203;
  const direction = labelConfig.direction ?? 1;  // Default to 1 (reverse)
  
  // Label setup
  commands.push(generateSizeCommand(labelConfig.width, labelConfig.height));
  commands.push(generateGapCommand(labelConfig.gap));
  commands.push(`DIRECTION ${direction}`);  // Use configured direction
  commands.push('CLS');
  
  // Use DPI for all dot calculations
  const labelWidthDots = mmToDots(labelConfig.width, dpi);
  const labelHeightDots = mmToDots(labelConfig.height, dpi);
  // ... rest of function uses dpi parameter
```

#### 3. Update DirectPrintDialog to Set 300 DPI for Custom Sizes

```typescript
const getLabelConfig = (): TSPLLabelConfig => {
  // Handle custom_WxH format (e.g., "custom_50x38")
  const customMatch = labelSize.match(/custom[_]?(\d+)x(\d+)/i);
  if (customMatch) {
    return {
      width: parseInt(customMatch[1]),
      height: parseInt(customMatch[2]),
      gap: 0,       // Continuous mode
      dpi: 300,     // TSC DA 310 is 300 DPI
      direction: 1, // Standard orientation
    };
  }
  
  // Handle standard thermal preset format
  const match = labelSize.match(/(\d+)x(\d+)/);
  if (match) {
    return {
      width: parseInt(match[1]),
      height: parseInt(match[2]),
      gap: 2,
      dpi: 203,     // Standard 203 DPI
      direction: 1, // Standard orientation
    };
  }
  return { ...TSPL_PRESETS['50x25'], direction: 1 };
};
```

#### 4. Update All mmToDots Calls

Pass the `dpi` parameter to all `mmToDots()` calls in the generation functions:

```typescript
const labelWidthDots = mmToDots(labelConfig.width, dpi);
const labelHeightDots = mmToDots(labelConfig.height, dpi);
const barcodeX = mmToDots(clampedX, dpi);
const barcodeY = mmToDots(clampedY, dpi);
// etc.
```

## Expected Result

### Before (Broken)
```
SIZE 50 mm, 38 mm
GAP 0 mm, 0 mm
DIRECTION 0          ← Wrong direction
CLS
TEXT 16,8,...        ← Wrong positions (203 DPI)
```

### After (Fixed)
```
SIZE 50 mm, 38 mm
GAP 0 mm, 0 mm
DIRECTION 1          ← Correct direction
CLS
TEXT 24,12,...       ← Correct positions (300 DPI: 12 dots/mm)
```

## Testing Checklist

After implementation:
- [ ] Labels print right-side up (not inverted)
- [ ] Text alignment matches preview
- [ ] Barcode position matches preview
- [ ] Font sizes appear correct (not too small or large)
- [ ] No printer red light errors
- [ ] Other organizations with 203 DPI printers still work

