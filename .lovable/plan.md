
# Ezzy ERP -- Full View UI Density Upgrade

## Overview
Upgrade the entire application from compact "Windows desktop density" to a spacious, professional ERP layout. This is a **purely frontend CSS and component change** -- no database, no API, no color changes.

## Phase 1 -- Global Density (src/index.css)

- Change body base font from `text-sm` (14px) to `text-[15px]`
- Update `.erp-compact` overrides:
  - Inputs: `h-8` to `h-10`
  - Labels: `text-xs` to `text-sm`
  - Table headers: `text-xs` to `text-[13px] font-semibold`
- Update sidebar menu button overrides:
  - `[data-sidebar="menu-button"]`: `h-10 text-[13px]` to `h-11 text-[14px]`
  - `[data-sidebar="menu-sub-button"]`: `h-9 text-[13px]` to `h-10 text-[14px]`
- Update global table styles:
  - `th`: `text-xs px-3 py-2` to `text-[13px] font-semibold px-4 py-2.5`
  - `td`: `text-sm px-3 py-2` to `text-sm px-4 py-2.5`
- Update card padding: `p-4` to `p-5`

## Phase 2 -- Input Height (src/components/ui/input.tsx)

- Change default height from `h-8` to `h-10`

## Phase 3 -- Label Size (src/components/ui/label.tsx)

- Change from `text-xs font-semibold` to `text-sm font-medium`

## Phase 4 -- Button Default Size (src/components/ui/button.tsx)

- Default size: `h-9 px-4` to `h-10 px-5`
- Icon size: `h-9 w-9` to `h-10 w-10`

## Phase 5 -- Dialog Full View (src/components/ui/dialog.tsx)

- Default content width: `max-w-lg` to `max-w-2xl`
- Padding: `p-6` to `p-8`
- Title: `text-lg` to `text-xl`

## Phase 6 -- Sidebar Group Headers (src/components/AppSidebar.tsx)

- Group header icons: `h-4 w-4` to `h-5 w-5`
- Group header label text: add `text-[15px]`
- Add `space-y-1` between sidebar groups for breathing room

## Summary of Files to Modify

| File | Change |
|------|--------|
| `src/index.css` | Body font, table density, sidebar heights, card padding, erp-compact overrides |
| `src/components/ui/input.tsx` | `h-8` to `h-10` |
| `src/components/ui/label.tsx` | `text-xs` to `text-sm`, `font-semibold` to `font-medium` |
| `src/components/ui/button.tsx` | Default `h-9` to `h-10`, icon `h-9 w-9` to `h-10 w-10` |
| `src/components/ui/dialog.tsx` | `max-w-lg` to `max-w-2xl`, `p-6` to `p-8`, title `text-xl` |
| `src/components/AppSidebar.tsx` | Group header icon/text sizing, group spacing |

## What Will NOT Change
- Color scheme (all HSL values stay the same)
- Dark theme colors
- Sidebar background/foreground colors
- Database schema or API logic
- Mobile responsiveness (mobile breakpoints preserved)
- POS screen layout (separate layout component)
