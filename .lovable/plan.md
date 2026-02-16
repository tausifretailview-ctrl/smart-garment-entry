

# Ezzy ERP -- Final UI Polish (Enterprise SaaS Finish)

Last-mile refinements to achieve a polished, premium enterprise feel. No color theme changes -- all updates use existing CSS variables for theme compatibility.

---

## Changes

### 1. `src/components/ui/table.tsx`

- **TableHeader**: Change `bg-sidebar [&_tr]:border-sidebar-border` to `bg-muted/70 [&_tr]:border-muted` (light header instead of dark sidebar-colored header)
- **TableHead**: Change `text-white` to `text-foreground` (fixes contrast for light header background)
- **TableRow**: Change `hover:bg-muted/50` to `hover:bg-primary/5` (subtle brand-tinted hover)
- **TableRow**: Change `border-border` to `border-muted` (softer row borders)

### 2. `src/index.css` -- Global table rules

- Update `table td` border from `border-muted` to `border-muted/80` for softer lines
- Update `table tbody tr` hover from `hover:bg-muted/50` to `hover:bg-primary/5`
- Update `.card` class from `p-5` to `p-6`
- Update `.erp-financial` utility: add `tracking-tight`

### 3. `src/components/ui/card.tsx`

- **Card**: Add `hover:shadow-md` to existing transition classes for interactive lift effect

### 4. `src/components/Header.tsx`

- Change header background from `bg-sidebar/95 text-sidebar-foreground border-sidebar-border` to `bg-card/95 text-foreground border-border` with `backdrop-blur-md`
- Update all child button colors from sidebar-specific tokens to standard theme tokens (e.g., `text-foreground`, `hover:bg-muted`, `hover:text-primary`)
- Update avatar fallback from `bg-sidebar-primary text-sidebar-primary-foreground` to `bg-primary text-primary-foreground`
- Update notification dot from `bg-sidebar-primary` to `bg-primary`
- Update mobile sheet from sidebar colors to standard colors

### 5. `src/components/ui/sidebar.tsx` -- Active state refinement

- **SidebarMenuButton variants**: Update `data-[active=true]` styles from `border-l-2` to `border-l-4` for a more prominent active indicator
- Ensure smooth `transition-all duration-200` is present (already in place)

### 6. `src/index.css` -- Sidebar active indicator

- Update the `[data-sidebar="menu-button"][data-active="true"]` rule: change `border-left: 3px` to `border-left: 4px` for consistency with the component-level change

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/ui/table.tsx` | Light header bg, brand hover, softer borders, fix text color |
| `src/index.css` | Softer td border, brand hover, card padding, financial tracking, sidebar active width |
| `src/components/ui/card.tsx` | Add hover shadow elevation |
| `src/components/Header.tsx` | Light header bar with backdrop blur, standard theme tokens |
| `src/components/ui/sidebar.tsx` | Active border-l-4 |

---

## What Is NOT Changed

- No color theme variables modified
- No business logic changes
- No print styles modified
- No typography scale changes (already at full-view density)
- No routing or data flow changes

