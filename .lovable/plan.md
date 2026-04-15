

## Odoo-Inspired Sidebar Redesign

Restyle the existing `AppSidebar.tsx` to achieve a compact, professional Odoo-like sidebar with active stripe indicators, tighter spacing, and a bottom Display Settings section.

## Changes

### 1. `src/components/AppSidebar.tsx` — Styling & Structure Overhaul

**Active State**: Replace `data-[active=true]:bg-primary data-[active=true]:text-primary-foreground` with a left-border active stripe approach:
- Remove the `bg-primary` active background from all menu items
- Add `data-[active=true]:border-l-[3px] data-[active=true]:border-l-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary` to all `SidebarMenuButton` and `SidebarMenuSubButton` elements

**Compact Spacing**: 
- Group headers: reduce padding from `p-2` to `py-1 px-2`
- Group labels: change `text-[15px]` to `text-xs uppercase tracking-wider text-muted-foreground/60` for Odoo-style sub-headers (e.g., "MASTER", "INVENTORY", "SALES", "REPORTS")
- Sub-items gap: reduce `gap-3` to `gap-2` throughout

**Organization Context at Top**: Add a compact org name display at the very top of `SidebarContent` (before Platform Admin group):
- Show `currentOrganization?.name` truncated in a small `Building2` icon + name bar
- When collapsed, show only the `Building2` icon
- Styled with `border-b border-sidebar-border py-2 px-3`

**Bottom Section**: Add UIScaleSelector (Monitor icon) alongside the existing lock toggle in the `mt-auto` footer group:
- Import `UIScaleSelector` and render it as a sidebar menu item with Monitor icon + "Display" label
- Place it above the collapse/lock toggle

**Colors**: Keep existing dark mode slate theme (`dark:bg-[hsl(213,32%,17%)]`), add `border-r border-sidebar-border` for light mode separation.

**Icon Sizes**: Standardize all group header icons to `h-4 w-4` (currently `h-5 w-5`), sub-item icons stay `h-4 w-4`.

### 2. `src/index.css` — Active Stripe CSS

Add sidebar-specific styles:
```css
/* Odoo-style active stripe for sidebar items */
[data-sidebar] [data-active="true"] {
  border-left: 3px solid hsl(var(--primary));
  background: hsl(var(--primary) / 0.08);
}
```

### 3. `src/components/UIScaleSelector.tsx` — Export Sidebar Variant

Add an exported `UIScaleSidebarItem` component that renders as a `SidebarMenuButton` with Monitor icon + "Display" label (when expanded), triggering the same dropdown. This avoids duplicating state logic.

### Technical Details
- All permission checks and menu access logic remain untouched
- The `collapsible="icon"` mode already handles mini sidebar (48px icon-only strip)
- Hover expand/lock behavior preserved as-is
- Group label styling changes are purely CSS class swaps — no structural changes to the Collapsible/CollapsibleTrigger tree
- Approximately 40-50 class string replacements across the file (batch find-replace pattern)
- Mobile sidebar (Sheet overlay) unaffected — changes target desktop only

