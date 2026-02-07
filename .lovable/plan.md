
# Fix: Ella Noor 50×38 Direct Print Alignment Issue

## Problem Summary

| Issue | Current Behavior | Expected Behavior |
|-------|-----------------|-------------------|
| **Wrong dimensions sent** | Direct Print receives `"custom"` which can't be parsed, defaults to 50×25mm | Should use actual 50×38mm dimensions |
| **Wrong gap setting** | Always sends `GAP 2 mm` (gap mode) | Ella Noor uses continuous rolls - needs `GAP 0 mm` |
| **Printer red light** | Printer expects gaps it can't find | Continuous mode = GAP 0 |

## Root Cause

The `DirectPrintDialog` component receives `labelSize={sheetType}` where `sheetType === "custom"` for Ella Noor. The parsing logic:

```typescript
const getLabelConfig = (): TSPLLabelConfig => {
  const match = labelSize.match(/(\d+)x(\d+)/);  // Returns null for "custom"
  if (match) {
    return { width: parseInt(match[1]), height: parseInt(match[2]), gap: 2 };
  }
  return TSPL_PRESETS['50x25'];  // Fallback: WRONG SIZE!
};
```

This means Ella Noor's 50×38mm labels are being generated with 50×25mm TSPL commands, causing content to be compressed and misaligned.

Additionally, the `gap: 2` is hardcoded, but continuous label rolls require `gap: 0`.

## Solution

### Part 1: Pass Custom Dimensions to DirectPrintDialog

Modify `BarcodePrinting.tsx` to pass actual dimensions when using custom sheet type:

**Before:**
```typescript
<DirectPrintDialog
  labelSize={sheetType}  // "custom" - can't parse dimensions
  ...
/>
```

**After:**
```typescript
<DirectPrintDialog
  labelSize={sheetType === "custom" ? `${customWidth}x${customHeight}` : sheetType}
  ...
/>
```

### Part 2: Handle Continuous Mode (GAP 0)

For continuous label rolls (no gap/black mark), the TSPL generator should use `GAP 0 mm`.

**Option A (Recommended)**: Detect from dimension pattern or add a setting

For now, we'll use `GAP 0` for non-standard sizes (custom presets) since they're typically continuous rolls.

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/BarcodePrinting.tsx` | Pass formatted dimensions for custom sheet type |
| `src/components/DirectPrintDialog.tsx` | Improve parsing to handle custom sizes and set GAP 0 for continuous mode |

## Implementation Details

### 1. BarcodePrinting.tsx (line ~4253)

Change:
```typescript
labelSize={sheetType}
```
To:
```typescript
labelSize={sheetType === "custom" ? `custom_${customWidth}x${customHeight}` : sheetType}
```

### 2. DirectPrintDialog.tsx (line ~92-102)

Update the `getLabelConfig` function to:
1. Handle `custom_50x38` style strings
2. Set `gap: 0` for custom sizes (continuous mode)

```typescript
const getLabelConfig = (): TSPLLabelConfig => {
  // Handle custom_WxH format (e.g., "custom_50x38")
  const customMatch = labelSize.match(/custom[_]?(\d+)x(\d+)/i);
  if (customMatch) {
    return {
      width: parseInt(customMatch[1]),
      height: parseInt(customMatch[2]),
      gap: 0,  // Custom sizes typically use continuous rolls
    };
  }
  
  // Handle standard thermal preset format (e.g., "thermal_50x30_1up")
  const match = labelSize.match(/(\d+)x(\d+)/);
  if (match) {
    return {
      width: parseInt(match[1]),
      height: parseInt(match[2]),
      gap: 2,  // Standard presets use gap mode
    };
  }
  
  return TSPL_PRESETS['50x25'];
};
```

## Expected Result

For Ella Noor with 50×38mm continuous labels:

**Before (broken):**
```
SIZE 50 mm, 25 mm   ← Wrong height!
GAP 2 mm, 0 mm      ← Wrong gap mode!
```

**After (correct):**
```
SIZE 50 mm, 38 mm   ← Correct dimensions
GAP 0 mm, 0 mm      ← Continuous mode
```

## Testing Checklist

- [ ] Direct Print dialog shows "50×38mm" for Ella Noor custom preset
- [ ] TSPL commands show `SIZE 50 mm, 38 mm`
- [ ] TSPL commands show `GAP 0 mm, 0 mm`
- [ ] Printer no longer shows red light
- [ ] Content alignment matches preview
- [ ] Other organizations with gap-based labels still work correctly
