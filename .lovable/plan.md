

## Fix: Al Nisa 40-Label Sheet Margin Reset Issue

### Problem
The Al Nisa user reports that their 40-label sheet margins were previously perfect but are now automatically changing. Labels are misaligned on the printed sheet.

### Root Causes Found

**1. Default Format useEffect Re-runs on Every Hook Update (MAJOR BUG)**
The useEffect at line 1189 that loads saved defaults has these dependencies:
```
[isLoadingSettings, dbLabelTemplates, dbMarginPresets, dbCustomPresets, dbDefaultFormat]
```
The `dbLabelTemplates`, `dbMarginPresets`, and `dbCustomPresets` are arrays returned from the `useBarcodeLabelSettings` hook. Every time the hook re-renders (e.g., on any state change), these arrays get new references, causing the effect to re-run and **reset all user-modified margins back to saved defaults**. This means if a user adjusts margins during a session, they can get silently reverted.

**2. Auto-Fit Scale Interacts Unpredictably with Margins**
The `getAutoFitScale()` function (line 2621) calculates a shrink factor based on content size including offsets. For Al Nisa's custom 40-label sheet (5x8, 40x35mm):
- Content width = 207mm, Content height = 289mm
- This triggers auto-shrinking (scale ~0.89x horizontally)
- Combined with their saved `printScale=150%`, the effective scale is ~1.33x
- Any margin change recalculates this scale, causing the "automatically changed" behavior

**3. @page CSS Adds Extra Top Margin**
The print CSS has `@page { margin: 3mm 0 0 0 }` for A4 sheets (line 4371), which adds 3mm top margin ON TOP of the user's padding-top offset. This causes cumulative vertical shift across rows.

### Fix Plan

**File: `src/pages/BarcodePrinting.tsx`**

1. **Stabilize the default format loading effect** - Add a `hasLoadedDefaults` ref to ensure the default format only loads ONCE when settings first arrive, not on every array reference change. This prevents user-adjusted margins from being silently reverted.

2. **Fix @page margin for custom sheets** - Change `@page { margin: 3mm 0 0 0 }` to `@page { margin: 0 }` for custom sheet types, since the user's padding offsets already handle margins. The 3mm extra top margin causes labels to shift down on each page.

3. **Exclude user offsets from auto-fit calculation** - Modify `getAutoFitScale()` to not include `topOffset`, `bottomOffset`, `leftOffset`, `rightOffset` in the content size calculation, since these are already handled by CSS padding. This prevents margin changes from affecting the print scale.

### Technical Details

```text
Change 1: Add hasLoadedDefaults ref
- Add: const hasLoadedDefaultsRef = useRef(false);
- Wrap the default format loading logic in: if (!hasLoadedDefaultsRef.current && dbDefaultFormat) { ... hasLoadedDefaultsRef.current = true; }
- Simplify dependency array to [isLoadingSettings]

Change 2: Fix @page margin
- Line 4371: Change margin from '3mm 0 0 0' to '0' for non-thermal sheets
- The user's topOffset/leftOffset padding already handles positioning

Change 3: Fix getAutoFitScale
- Line 2636-2637: Remove offset additions from content size:
  Before: contentWidth = (cols*width) + ((cols-1)*gap) + leftOffset + rightOffset
  After:  contentWidth = (cols*width) + ((cols-1)*gap)
  Same for contentHeight
```

These three changes together will ensure:
- Saved margins load once and stay stable
- Print scale is not affected by margin adjustments
- No double-margin effect from @page CSS + padding offsets

