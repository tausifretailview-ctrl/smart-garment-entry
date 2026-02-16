

# Full-View Professional ERP Density Upgrade

Upgrade the entire Ezzy ERP from compact SaaS density to a spacious, large-screen-optimized professional ERP layout (Vasy ERP style). No color or logic changes -- only scale, spacing, and typography.

---

## Summary of Changes

| Element | Current | New |
|---------|---------|-----|
| HTML base font | (browser default) | 16px |
| Body text | 15px | 16px, line-height 1.6 |
| Page titles | text-2xl (~24px) | text-[26px], mb-8 |
| Section titles | text-lg | text-[20px] |
| Table headers | 12px, py-3, px-4 | 13px, py-4, px-5 |
| Table data | 14px, py-3, px-4 | 15px, py-4, px-5 |
| Table row height | h-10 | h-14 |
| Financial columns | 14px | 15px |
| KPI values | text-2xl | text-[28px] |
| Form labels | 13px | 14px |
| Input height | h-10 | h-11, text-[15px] |
| Select trigger | h-10, text-sm | h-11, text-[15px] |
| Card padding | p-3 | p-6 |
| Badge text | 11px | 13px, px-3 py-1 |
| Dialog width | max-w-2xl | max-w-3xl, p-8 |
| Dialog title | text-xl | text-[22px] |
| Sidebar menu items | h-11, 14px | h-12, 15px |
| Sidebar group labels | (default) | 13px uppercase tracking-wider |
| Sidebar icons | size-4 | size-5 |

---

## File-by-File Changes

### 1. `src/index.css` -- Global CSS

- Add `html { font-size: 16px; }` rule
- Update `body` from `text-[15px] leading-relaxed` to `text-[16px] antialiased` with `line-height: 1.6`
- Update `table th` from `text-[12px] px-4 py-3` to `text-[13px] py-4 px-5`
- Update `table td` from `text-[14px] px-4 py-3` to `text-[15px] py-4 px-5`
- Add `table { border-collapse: separate; border-spacing: 0; }`
- Update sidebar selectors: `[data-sidebar="menu-button"]` from `h-11 text-[14px]` to `h-12 text-[15px]`; sub-button from `h-10 text-[14px]` to `h-11 text-[15px]`
- Update ERP utility classes:
  - `.erp-page-title`: `text-[26px] font-bold tracking-tight`
  - `.erp-section-title`: `text-[20px] font-semibold`
  - `.erp-table-header`: `text-[13px]`
  - `.erp-table-data`: `text-[15px]`
  - `.erp-financial`: `text-[15px]`
  - `.erp-customer-name`: `text-[15px] font-semibold`
  - `.erp-form-label`: `text-[14px] font-medium`
  - `.erp-badge`: `text-[13px] font-semibold`
  - `.erp-kpi-value`: `text-[28px] font-bold tracking-tight`
- Update ERP design tokens: `--erp-row-height: 3.5rem; --erp-input-height: 2.75rem;`

### 2. `src/components/ui/table.tsx`

- `TableHead`: Change `h-10 px-4 py-3 text-[12px]` to `h-14 px-5 py-4 text-[13px]`
- `TableCell`: Change `px-4 py-3 text-[14px]` to `px-5 py-4 text-[15px]`

### 3. `src/components/ui/card.tsx`

- `CardHeader`: Change `p-3` to `p-6`
- `CardContent`: Change `p-3 pt-0` to `p-6 pt-0`
- `CardFooter`: Change `p-3 pt-0` to `p-6 pt-0`
- `Card`: Add `rounded-xl` (keep existing rounded-md override-able)

### 4. `src/components/ui/badge.tsx`

- Change base from `px-2 py-0.5 text-[11px]` to `px-3 py-1 text-[13px]`

### 5. `src/components/ui/label.tsx`

- Change from `text-[13px]` to `text-[14px]`

### 6. `src/components/ui/input.tsx`

- Change from `h-10` to `h-11 text-[15px]`

### 7. `src/components/ui/select.tsx`

- `SelectTrigger`: Change `h-10 text-sm` to `h-11 text-[15px]`

### 8. `src/components/ui/dialog.tsx`

- `DialogContent`: Change `max-w-2xl p-8` to `max-w-3xl p-8` (p-8 already present)
- `DialogTitle`: Change `text-xl` to `text-[22px]`

### 9. `src/components/ui/sidebar.tsx`

- `SidebarGroupLabel`: Change `text-[13px]` to `text-[13px] uppercase tracking-wider`
- `sidebarMenuButtonVariants`: Change `[&>svg]:size-4` to `[&>svg]:size-5`; default height `h-10` to `h-12`; sm `h-8` to `h-10`
- `SidebarMenuSub`: Update icon size reference

---

## What Is NOT Changed

- No color theme changes
- No business logic changes
- No print styles modified
- No routing or data flow changes

