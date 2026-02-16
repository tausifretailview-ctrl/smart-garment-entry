

# Ultra-Premium Typography Scale -- System-Wide Implementation

## Overview

Apply a strict, consistent typography hierarchy across the entire Ezzy ERP application by updating global CSS rules and key UI components. No color changes.

---

## Typography Scale Reference

| Element | Size | Weight | Extras |
|---------|------|--------|--------|
| Body base | 15px | normal | line-height: 1.5, antialiased |
| Page titles | text-2xl | bold | tracking-tight |
| Section titles | text-lg | semibold | -- |
| Table headers | 12px | semibold | uppercase, tracking-wider |
| Table data | 14px | normal | -- |
| Financial columns | 14px | medium | text-right, tabular-nums |
| Customer name cols | 14px | semibold | -- |
| Form labels | 13px | medium | -- |
| Badge text | 11px | semibold | -- |
| KPI values | text-2xl | bold | tracking-tight |

---

## Changes

### 1. Global CSS (`src/index.css`)

Update the base body rule to enforce 15px, line-height 1.5, and antialiased rendering:

```css
body {
  @apply bg-background text-foreground text-[15px] leading-relaxed antialiased;
}
```

Update the global table `th` rule to use 12px uppercase tracking-wider:

```css
table th {
  @apply text-[12px] uppercase tracking-wider font-semibold px-4 py-3;
}
```

Update the global table `td` rule to use 14px:

```css
table td {
  @apply text-[14px] px-4 py-3 border-b border-muted;
}
```

### 2. Table Component (`src/components/ui/table.tsx`)

- `TableHead`: Change from `text-[13px] font-semibold` to `text-[12px] uppercase tracking-wider font-semibold`
- `TableCell`: Keep `text-[14px]` (already correct)

### 3. Badge Component (`src/components/ui/badge.tsx`)

- Change base size from `text-xs` to `text-[11px] font-semibold`

### 4. Label Component (`src/components/ui/label.tsx`)

- Change from `text-sm font-medium` to `text-[13px] font-medium`

### 5. Sidebar Menu Items (`src/index.css`)

- Keep existing `text-[14px]` for sidebar items (already consistent)

---

## Utility Classes (added to `src/index.css`)

Add reusable ERP typography utility classes under `@layer utilities`:

```css
/* ERP Typography Utilities */
.erp-page-title {
  @apply text-2xl font-bold tracking-tight;
}

.erp-section-title {
  @apply text-lg font-semibold;
}

.erp-table-header {
  @apply text-[12px] uppercase tracking-wider font-semibold;
}

.erp-table-data {
  @apply text-[14px];
}

.erp-financial {
  @apply text-[14px] font-medium text-right tabular-nums;
}

.erp-customer-name {
  @apply text-[14px] font-semibold;
}

.erp-form-label {
  @apply text-[13px] font-medium;
}

.erp-badge {
  @apply text-[11px] font-semibold;
}

.erp-kpi-value {
  @apply text-2xl font-bold tracking-tight;
}
```

These utility classes provide a single source of truth. Existing pages that already use inline Tailwind classes will inherit the correct sizes from the updated global rules (body, table th/td, badge, label). Pages can optionally use these named classes for explicit control.

---

## Files Changed

| File | Change |
|------|--------|
| `src/index.css` | Update body base, table th/td globals, add typography utilities |
| `src/components/ui/table.tsx` | Update TableHead to 12px uppercase tracking-wider |
| `src/components/ui/badge.tsx` | Update base size to text-[11px] |
| `src/components/ui/label.tsx` | Update to text-[13px] |

---

## What Is NOT Changed

- No color theme changes
- No print styles modified
- No layout or spacing changes beyond typography
- Sidebar menu items already at 14px (kept as-is)

