

# Ezzy ERP -- Final Full View UI Polish

## What's Already Done (No Changes Needed)
- Body font: `text-[15px]` -- already set
- Input height: `h-10` -- already set
- Label: `text-sm font-medium` -- already set
- Button default: `h-10 px-5` -- already set
- Dialog: `max-w-2xl`, `p-8`, title `text-xl font-semibold` -- already set
- Sidebar menu buttons: `h-11 text-[14px]` / sub: `h-10 text-[14px]` -- already set
- Sidebar group header icons: `h-5 w-5`, text: `text-[15px] font-semibold` -- already set
- Table row hover: `hover:bg-muted/50 transition-colors` -- already on TableRow component

## What Still Needs Polish

### 1. Table Component Hardcoded Compact Sizes (Critical)
**File: `src/components/ui/table.tsx`**

The global CSS sets `py-2.5 px-4 text-[13px]` for table headers, but the `TableHead` component has hardcoded `h-8 px-2 text-xs font-bold` which **overrides** the CSS. Similarly `TableCell` has `px-2 py-1.5`.

Changes:
- `TableHead`: `h-8 px-2 text-xs font-bold` changed to `h-10 px-4 py-3 text-[13px] font-semibold`
- `TableCell`: `px-2 py-1.5 text-sm` changed to `px-4 py-3 text-[14px]`

### 2. Dialog Overlay Too Dark
**File: `src/components/ui/dialog.tsx`**

- `DialogOverlay`: `bg-black/80` softened to `bg-black/40` for visual comfort

### 3. Sidebar Group Vertical Spacing
**File: `src/components/AppSidebar.tsx`**

- Add `space-y-1` class to `SidebarContent` for breathing room between menu groups

### 4. Global CSS Table Padding Bump
**File: `src/index.css`**

- Update table th/td from `py-2.5` to `py-3` for final premium spacing

## Summary

| File | Change |
|------|--------|
| `src/components/ui/table.tsx` | TableHead: `h-10 px-4 py-3 text-[13px] font-semibold`; TableCell: `px-4 py-3 text-[14px]` |
| `src/components/ui/dialog.tsx` | Overlay: `bg-black/80` to `bg-black/40` |
| `src/components/AppSidebar.tsx` | SidebarContent: add `space-y-1` |
| `src/index.css` | Table th/td: `py-2.5` to `py-3` |

## No Changes To
- Color scheme
- Database / API
- Mobile layouts
- Print templates

