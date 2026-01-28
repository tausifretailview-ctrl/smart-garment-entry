
# Dashboard Resolution Enhancement - Match VASY ERP Style

## Problem
The current dashboard cards appear too small and compact compared to VASY ERP. The "compact ERP" styling was applied too aggressively, making:
- Card values too small (`text-lg` = 18px)
- Card padding too minimal (`p-2`)
- Icons too small (`h-3.5 w-3.5`)
- Overall card heights too short

## Solution
Increase dashboard card sizing to match VASY ERP proportions while keeping the layout efficient.

### Changes to `AnimatedMetricCard` in `src/pages/Index.tsx`

| Element | Current | VASY-Style |
|---------|---------|------------|
| CardHeader padding | `p-2 pb-1` | `p-3 pb-2` |
| Title font | `text-xs` | `text-sm` |
| Icon container | `p-1.5 rounded-lg` | `p-2 rounded-lg` |
| Icon size | `h-3.5 w-3.5` | `h-4 w-4` |
| CardContent padding | `p-2 pt-0` | `p-3 pt-0` |
| Value font | `text-lg font-extrabold` | `text-2xl font-bold` |

### Changes to Section Headers

| Element | Current | VASY-Style |
|---------|---------|------------|
| Section title | `text-sm` | `text-base` |
| Accent bar | `h-0.5 w-6` | `h-1 w-8` |
| Margin bottom | `mb-2` | `mb-3` |

### Grid Spacing

| Element | Current | VASY-Style |
|---------|---------|------------|
| Grid gap | `gap-2` | `gap-3` |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Index.tsx` | Increase padding, font sizes, and icon sizes in AnimatedMetricCard; increase section header sizes; adjust grid gaps |

---

## Visual Comparison

**Before (Current):**
- Cards: ~60px height
- Values: 18px font
- Compact feel

**After (VASY-Style):**
- Cards: ~80px height
- Values: 24px font
- Professional ERP appearance matching VASY

---

## Expected Outcome
- Dashboard cards will have the same proportions as VASY ERP
- Values will be larger and more prominent
- Cards will have better visual hierarchy
- Overall dashboard will look more professional and easier to read
