

# Redesign Purchase Bill Form UI - Premium SaaS ERP Look

## Overview
Upgrade the Purchase Entry page with improved visual hierarchy, reduced white space, and a polished SaaS ERP appearance while maintaining the compact, high-density layout.

## Changes

### 1. Page Background (soft grey)
**File: `src/pages/PurchaseEntry.tsx` (line 2226)**
- Change the outer wrapper from `bg-background` to `bg-[#f4f6f9] dark:bg-background` to apply the soft grey background in light mode.

### 2. Supplier Details Card - White Card with Border
**File: `src/index.css` (lines 1038-1043)**
- Update `.erp-invoice-info-card` background from `hsl(210 20% 98%)` to `#ffffff` with `border: 1px solid #e5e7eb`, `border-radius: 8px`, `padding: 16px`.

### 3. Products Card - White Card Container
**File: `src/pages/PurchaseEntry.tsx` (line 2431)**
- Update the Products card div to use `bg-white dark:bg-card` with `border border-[#e5e7eb] rounded-lg p-4` for a clean white card look.

### 4. Save Bill Button - Gradient Blue Primary
**File: `src/pages/PurchaseEntry.tsx` (lines 2902-2916)**
- Add gradient styling to Save Bill button: `bg-gradient-to-r from-[#2563eb] to-[#1e40af] hover:from-[#1d4ed8] hover:to-[#1e3a8a] text-white font-bold shadow-md`

### 5. Print Barcodes & Import Excel - Outline Style
- Print Barcodes button (line 2892) already uses `variant="outline"` -- confirmed correct.
- Import Excel button (line 2436) already uses `variant="outline"` -- confirmed correct.

### 6. Sticky Footer Action Bar - Enhanced
**File: `src/index.css` (lines 1026-1036)**
- Update `.erp-invoice-sticky-actions` with stronger top border (`2px solid #e5e7eb`), increased padding, and subtle spacing.

### 7. Table Header Background
**File: `src/index.css` (lines 1011-1019)**
- Change `.erp-invoice-table-header th` background from `hsl(210 20% 96%)` to `#f3f4f6` for the specified grey.

### 8. Row Hover Effect
**File: `src/pages/PurchaseEntry.tsx` (line ~2505)**
- The table rows already have `hover:bg-primary/5`. Update to `hover:bg-[#f9fafb]` for the exact requested hover color.

### 9. Consistent Button Heights
- Ensure action bar buttons use `h-9` or `h-10` (36-40px) consistently. The current `size="lg"` gives `h-11` (44px) -- change to `size="default"` for 40px height.

## Technical Summary

| File | Changes |
|------|---------|
| `src/pages/PurchaseEntry.tsx` | Page bg, Products card styling, Save button gradient, row hover, button sizes |
| `src/index.css` | `.erp-invoice-info-card` white bg, `.erp-invoice-table-header th` grey, `.erp-invoice-sticky-actions` border |

All changes maintain the existing compact ERP layout and dark mode support.

