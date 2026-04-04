

## Fix: Lines/Separators Automatically Disappearing in Label Designer

### Problem
When a line is added in the Precision Label Designer, it disappears because the `ensureCompleteFieldOrder()` helper function rebuilds the config object **without preserving the `lines` array**. This function is called every time a template is loaded, a preset is applied, or a config is migrated — silently wiping all lines.

### Root Cause
In `src/pages/BarcodePrinting.tsx` (line 98-128), the `ensureCompleteFieldOrder` function returns a new object with hardcoded keys but omits `lines`:

```text
return {
  brand: ...,
  productName: ...,
  ...
  customTextValue: ...,
  // ← lines is MISSING here
};
```

This function is called in ~10 places throughout the file whenever configs are loaded or templates are applied.

### Fix

**File: `src/pages/BarcodePrinting.tsx`**

Add `lines` preservation to the `ensureCompleteFieldOrder` return object (around line 127):

```typescript
// Add after customTextValue line:
lines: config.lines || [],
```

This single-line fix ensures the `lines` array survives all config migrations and template loads. No other files need changes — the Designer, Canvas, and save logic all handle `lines` correctly already.

### Technical Details
- The `lines` property is a `LabelLineConfig[]` storing separator positions, thickness, orientation
- The save path (`saveLabelTemplate`) correctly persists `lines` as part of `config`
- The load path breaks because `ensureCompleteFieldOrder` strips it during migration
- Same function also doesn't preserve other potential future properties; adding `lines` explicitly is the targeted fix

