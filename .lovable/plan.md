

# Daily Tally -- "Solid & Trustworthy" Enterprise Redesign

## Overview
Complete visual overhaul of `DailyTally.tsx` to achieve a premium FinTech aesthetic with enterprise-grade typography, color coding, and component structure. No logic changes -- purely UI/UX transformation.

---

## 1. Typography & Number System

- Add `font-variant-numeric: tabular-nums` globally to all currency values via utility classes
- Use `font-semibold` (600) for labels, `font-bold` (700) for totals and headers
- Transaction labels: `text-slate-500 text-sm` (muted, small)
- Currency amounts: `text-lg` or `text-2xl`, dark and bold
- All numerical columns perfectly right-aligned with consistent decimal alignment

## 2. Color Palette Changes

| Element | Current | New |
|---------|---------|-----|
| Money In header/accents | `text-emerald-400` | `text-emerald-600` (stronger contrast) |
| Money Out header/accents | `text-red-400` | `text-rose-600` (enterprise rose) |
| Save/Snapshot button | Default primary | `bg-indigo-700 hover:bg-indigo-800` with shadow |
| Card borders | Default `border-border` | `border-[1.5px] border-slate-200` (thicker, purposeful) |
| Difference badges | Existing color scheme | Enhanced with `ring-2` for emphasis |

## 3. Hero Summary Cards (Top 4)

- Thicker border (`border-[1.5px]`) with subtle left-accent stripe (4px colored left border)
- Icon placed in a soft colored circle background
- Title: `text-xs uppercase tracking-wider text-slate-500`
- Value: `text-2xl font-bold tabular-nums text-slate-900`
- Subtle hover shadow elevation

## 4. Twin-Pillar Layout (Money In / Money Out)

- Side-by-side on desktop (`grid grid-cols-1 lg:grid-cols-2 gap-6`)
- Each card with colored top border (emerald for In, rose for Out)
- Table headers: `font-bold text-xs uppercase tracking-wider bg-slate-50`
- Total row: `bg-emerald-50` or `bg-rose-50` with bold text
- Stripe pattern on rows for readability (`even:bg-slate-50/50`)

## 5. Denomination Tally ("Digital Drawer" Hero Section)

- Larger input fields (`h-11 w-24 text-center text-lg font-bold`)
- Each denomination row with subtle card-like feel
- Note value displayed as a badge-like chip (`bg-slate-100 rounded-md px-3 py-1 font-bold`)
- Running total prominently displayed at bottom with `text-2xl font-bold text-indigo-700`
- Instruction text styled as an alert/callout box with a border-left accent

## 6. Variance Shield (Difference Display)

- Large central area within reconciliation
- Balanced (0): Solid green badge with checkmark icon, `bg-emerald-50 border-emerald-600 border-2`
- Minor diff (<=100): Warning amber with alert icon, `bg-amber-50 border-amber-500 border-2`
- Mismatch (>100): High-visibility red alert, `bg-red-50 border-red-600 border-2`, pulsing ring effect
- Difference value: `text-4xl font-bold tabular-nums` (largest number on screen)

## 7. Save Snapshot Button ("The Final Touch")

- Standalone prominent styling: `bg-indigo-700 hover:bg-indigo-800 text-white shadow-lg hover:shadow-xl`
- Size: `h-12 px-8 text-base font-semibold rounded-lg`
- Save icon + text "Save Snapshot"
- Satisfying scale animation on hover (`hover:scale-[1.02]`)
- Separated from other toolbar buttons, placed with more visual weight

## 8. Settlement Section

- Clean 3-column grid with labeled inputs
- Handover to Owner displayed as a highlighted calculated field with `bg-indigo-50 border-indigo-200`
- Notes textarea with subtle styling

## 9. Page Header

- Title: `text-2xl font-bold text-slate-900`
- Date subtitle: `text-sm text-slate-500`
- Status badge with thick border and proper contrast
- Action buttons grouped with consistent `border-[1.5px]` styling

---

## Technical Changes

### Files Modified
1. **`src/pages/DailyTally.tsx`** -- All UI class changes:
   - Update `MoneyRow` component with new styling (striped rows, tabular-nums)
   - Restructure summary cards with accent borders and icon circles
   - Move Money In/Out to side-by-side grid layout
   - Restyle denomination inputs to be larger, bolder
   - Enhance difference display to "Variance Shield" pattern
   - Restyle Save Snapshot button with indigo theme
   - Add `border-[1.5px]` to all Card components
   - Update color classes from `*-400` to `*-600` variants

No new dependencies needed. All changes use existing Tailwind classes and shadcn components.

