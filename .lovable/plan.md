
# Customer Master UI Upgrade - Vasy ERP Professional Grid System

## Overview
Redesign the Customer Master page to match Vasy ERP's professional grid standard while keeping existing Ezzy ERP colors, logic, and functionality intact. This is a layout-only upgrade focusing on typography, alignment, spacing, and visual polish.

## Changes (Single File: `src/pages/CustomerMaster.tsx`)

### 1. Page Container
- Wrap content in a professional SaaS card container with `bg-slate-50/50 min-h-screen` outer wrapper and `bg-white shadow-sm rounded-lg p-5` inner card.

### 2. Page Header (Vasy Style)
- Title: `text-[20px] font-bold text-slate-800`
- Action buttons: `h-9 text-sm px-4 rounded-md` in a `flex gap-2 items-center` row.

### 3. Search + Filter Bar
- Slim professional row with `flex items-center gap-3 mb-4`
- Search input: `h-9 text-sm px-3 rounded-md border`

### 4. Table Grid Precision
- **Headers**: `text-[12px] uppercase tracking-wider font-bold`, background `bg-slate-100/80`, text color `text-slate-600`, padding `py-2 px-4`
- **Data cells**: `text-[13px]`, row height `h-11`
- **Row hover**: `hover:bg-blue-50/30 transition`

### 5. Column Alignment (Critical)
Reorder columns to: **Sr No | Customer Name | Mobile | Email | GST | Opening Balance | Advance | Discount % | Status | Actions**

| Column | Alignment | Style |
|--------|-----------|-------|
| Sr No | Left | `font-medium tabular-nums` |
| Customer Name | Left | `font-semibold text-blue-600` |
| Mobile / GST | Left | `tabular-nums` |
| Opening Balance, Advance, Discount | **Right** | `text-right font-medium tabular-nums` with rupee formatting |
| Actions | Right | Icon buttons `h-8 w-8 rounded-md hover:bg-slate-100` |

### 6. Status Badges (Soft Vasy Style)
- Active: `px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700 border border-green-200`
- No explicit status column exists currently, so we will add a visual "Active" badge column.

### 7. Financial Number Polish
- Apply `tabular-nums` to all currency and numeric columns to prevent digit jumping.
- Format with `toLocaleString('en-IN')` consistently.

### 8. Row Interactions
- Add `hover:bg-blue-50/30 transition` to all table rows.
- Keep existing context menu and click behaviors.

### 9. Micro Refinements
- Reduce table vertical padding slightly for high-density ERP feel
- Remove heavy grid lines (use lighter borders)
- Maintain sticky header via existing TableHeader `sticky top-0`

---

## Technical Details

**File modified**: `src/pages/CustomerMaster.tsx`

**Key class changes**:
- Outer wrapper: `<div className="bg-slate-50/50 min-h-screen">` + `<div className="bg-white shadow-sm rounded-lg p-5">`
- TableHeader override: custom className for `bg-slate-100/80` headers with `text-[12px] uppercase tracking-wider font-bold text-slate-600`
- TableHead cells: override with `py-2 px-4` and appropriate alignment
- TableCell data: `text-[13px]` with `tabular-nums` on numeric columns
- TableRow: add `hover:bg-blue-50/30 transition h-11`
- Action icon buttons: `h-8 w-8 rounded-md hover:bg-slate-100`

**No changes to**:
- Business logic, data fetching, mutations
- Theme colors or global CSS
- Any other files
