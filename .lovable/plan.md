

## Label Print Position Issue - Analysis & Fix

### Problem Identified

The printed label shows content at the **bottom** of the 50×38mm label with large empty space at the **top**. This is opposite to what the visual label designer shows.

### Root Cause

The TSPL generator uses `DIRECTION 1` which inverts the coordinate system:

| DIRECTION | Origin Position | Effect |
|-----------|-----------------|--------|
| 0 | Top-left corner | Y=0 is at top, content prints as designed |
| 1 | Bottom-right corner | Y=0 is at bottom, effectively flips the layout |

Your template has fields positioned from the top (brand at y=1.35mm, productName at y=9.97mm), but `DIRECTION 1` interprets these as positions from the bottom, causing the empty space at the top.

---

### Solution

Change the TSPL `DIRECTION` command from `1` to `0` so the printer coordinate system matches the visual designer:

**File**: `src/utils/tsplGenerator.ts`

**Line 189 - Current code:**
```typescript
commands.push('DIRECTION 1');
```

**Fixed code:**
```typescript
commands.push('DIRECTION 0');
```

This single change will make the printed output match the visual designer exactly.

---

### Technical Details

The visual label designer in BarTenderLabelDesigner uses a standard web coordinate system:
- Origin (0,0) at **top-left**
- Y increases downward

TSPL `DIRECTION 0` uses the same coordinate system:
- Origin at **top-left** relative to feed direction
- Y increases toward bottom of label

TSPL `DIRECTION 1` inverts this:
- Origin at **bottom-right**
- Content appears "upside down" relative to designer positions

---

### Additional Consideration

The same fix should be applied to the legacy `generateTSPLLabel` function (line 335) to maintain consistency across both template-based and legacy label generation.

**Line 335 - Also needs updating:**
```typescript
commands.push('DIRECTION 0');
```

---

### Expected Result After Fix

| Field | Designer Y Position | Printed Position |
|-------|---------------------|------------------|
| Brand | 1.35mm from top | Near top edge |
| Product Name | 9.97mm from top | Below brand |
| Size | 16.03mm from top | Middle area |
| Price | 15.85mm from top | Middle area |
| Barcode | 22.39mm from top | Lower section |
| Barcode Text | 30.55mm from top | Near bottom |

