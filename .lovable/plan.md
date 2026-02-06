

## Direct Print Button Not Showing - Analysis & Fix

### Root Cause Identified

The "Direct Print" button in the Barcode Printing page only appears when the sheet type starts with "thermal". Your organization (ELLA NOOR) has saved a **custom sheet preset** named "50×38" with dimensions 50mm × 38mm as the default format.

Since the sheet type is `"custom"` (not `"thermal_..."`) the Direct Print button is hidden.

### Your Current Settings

| Setting | Value |
|---------|-------|
| Sheet Type | Custom |
| Custom Preset | 50×38 |
| Dimensions | 50mm × 38mm |
| Columns | 1 (single label) |

This is clearly a thermal label configuration, but the code doesn't recognize it as such.

---

### Proposed Fix

Update the visibility condition for the Direct Print button to show it for:
1. Any thermal preset (sheet types starting with "thermal")
2. Custom sheet sizes (since custom sizes are typically used for thermal printers)

### Technical Details

**File to modify**: `src/pages/BarcodePrinting.tsx`

**Current code** (line 4113):
```tsx
{sheetType.startsWith('thermal') && (
```

**Updated code**:
```tsx
{(sheetType.startsWith('thermal') || sheetType === 'custom') && (
```

This single-line change will make the Direct Print button appear for your custom thermal label configuration.

---

### Summary

- **Issue**: Direct Print button hidden for custom sheet sizes
- **Cause**: Code only checks for "thermal_..." prefix
- **Fix**: Also show button for "custom" sheet type
- **Impact**: One line change, no breaking changes to other features

