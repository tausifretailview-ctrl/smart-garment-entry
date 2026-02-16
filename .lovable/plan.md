

# Premium ERP Invoice Entry Redesign

## Overview
Redesign the Sale Invoice (`SalesInvoice.tsx`) and Purchase Invoice (`PurchaseEntry.tsx`) entry screens into a premium, section-based ERP interface inspired by Zoho Books / Oracle ERP. The design will use clear visual card sections, improved typography hierarchy, a professional totals summary card, and a sticky action bar.

## Current State
Both files are large (2793 and 3138 lines respectively) with all UI rendered inline. The layout is a single Card wrapping everything with a sticky header. There is no visual separation between sections -- customer info, product search, table, and totals all blend together.

## Design Approach
Rather than rewriting these massive files, we will apply targeted CSS/className changes to the existing JSX structure to create visual section separation and premium styling. No structural refactoring of components.

---

## Changes by File

### 1. `src/pages/SalesInvoice.tsx` (UI restructuring)

**A. Header Section Card** (lines ~1930-1953)
- Wrap title + last invoice pill in a standalone rounded card with `bg-card rounded-xl border shadow-sm p-5`
- Last invoice info becomes a styled pill badge
- Title: 18px semibold with icon

**B. Customer & Invoice Info Section** (lines ~1956-2219)
- Wrap in a separate card with `bg-[hsl(210,20%,98%)] rounded-xl border p-5`
- Add section label: `INVOICE DETAILS` in uppercase 12px muted tracking-wide
- Customer field gets col-span-2 for prominence
- Required fields get a subtle red dot indicator

**C. Product Search & Entry Mode Bar** (lines ~2222-2357)
- Separate card/section with clear border-top divider
- Barcode scan and Browse Products buttons get refined styling with rounded-lg, proper icon sizing
- Total Qty badge gets elevated styling

**D. Table Redesign** (lines ~2360-2537)
- Header row: `bg-[#F3F4F6] dark:bg-muted/50` with 12px uppercase bold, letter-spacing 0.5px
- Row height: 48px with subtle separator borders (`border-b border-border/50`)
- Hover: `hover:bg-primary/[0.03]`
- Editable input fields: `bg-muted/30 rounded-md focus:ring-2 focus:ring-primary/30 focus:border-primary`
- Remove heavy borders, use clean separators

**E. Totals Summary Card** (lines ~2541-2600)
- Wrap in a dedicated card: `bg-gradient-to-br from-blue-50/50 to-indigo-50/30 dark:from-blue-950/20 dark:to-indigo-950/10 rounded-xl border p-6`
- Grand Total: 20px bold with primary color
- Section title: `BILL SUMMARY` uppercase
- Right-aligned layout preserved

**F. Sticky Action Bar** (lines ~2609-2614)
- Move to a sticky bottom bar: `sticky bottom-0 bg-card/95 backdrop-blur-sm border-t shadow-lg p-4 -mx-6 -mb-6`
- Save button: full primary style with proper sizing
- Add Cancel button (navigates back)

### 2. `src/pages/PurchaseEntry.tsx` (matching changes)

**A. Header & Supplier Section** (lines ~2300-2425)
- Split into Header Card (title + last bill reference) and Supplier Info Card
- Supplier selection card gets `bg-[hsl(210,20%,98%)]` background
- Section label: `SUPPLIER & BILL DETAILS`

**B. Products Table Card** (lines ~2429-2825)
- Same table styling as Sales Invoice
- Header: uppercase, `bg-[#F3F4F6]`, 12px font
- Row height 48px, subtle hover
- Editable inputs with refined focus states

**C. Bill Totals Card** (lines ~2827-2891)
- Match Sales Invoice totals card styling
- `bg-gradient-to-br from-blue-50/50 to-indigo-50/30` background
- Net Amount: 20px bold primary color
- Section title: `BILL SUMMARY`

**D. Action Bar** (lines ~2893-2919)
- Sticky bottom bar matching Sales Invoice
- Print Barcodes + Save Bill buttons with consistent styling

### 3. `src/index.css` (optional utility classes)

Add a small set of ERP invoice utility classes:

```css
.erp-section-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  margin-bottom: 12px;
}

.erp-summary-card {
  background: linear-gradient(135deg, hsl(217 91% 97%) 0%, hsl(226 70% 97%) 100%);
  border-radius: 12px;
  border: 1px solid hsl(var(--border));
  padding: 24px;
}

.erp-table-header th {
  font-size: 12px !important;
  font-weight: 700 !important;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  background: #F3F4F6;
}

.erp-sticky-actions {
  position: sticky;
  bottom: 0;
  background: hsl(var(--card) / 0.95);
  backdrop-filter: blur(8px);
  border-top: 1px solid hsl(var(--border));
  padding: 16px 24px;
  margin: 0 -24px -24px;
  box-shadow: 0 -2px 10px rgba(0,0,0,0.05);
}
```

Dark mode variants will use existing theme tokens.

---

## Typography Scale (applied via classNames)

| Element | Size | Weight |
|---------|------|--------|
| Page Title | 18px | 600 |
| Section Labels | 12px uppercase | 600 |
| Form Labels | 13px | 500 |
| Inputs | 14px | 400 |
| Table Headers | 12px uppercase | 700 |
| Table Body | 13px | 400 |
| Grand Total | 20px | 700 |

## Color Tokens (already exist in the design system)

| Purpose | Token |
|---------|-------|
| Primary Blue | `hsl(217, 91%, 60%)` -- already `--primary` |
| Success | `hsl(142, 71%, 45%)` -- already `--success` |
| Warning | `hsl(38, 92%, 50%)` -- already `--warning` |
| Danger | `hsl(0, 84%, 60%)` -- already `--destructive` |
| Neutral BG | `hsl(210, 20%, 98%)` -- close to `--secondary` |

No new color tokens needed -- the existing design system covers these.

---

## Scope & Consistency

The same visual patterns will apply to both Sale Invoice and Purchase Invoice. Sale Return, Delivery Challan, and other entry screens can adopt the same classes in a follow-up pass. The changes are purely presentational -- no business logic, state, or data flow modifications.

## Files Modified
1. `src/pages/SalesInvoice.tsx` -- className updates to JSX
2. `src/pages/PurchaseEntry.tsx` -- className updates to JSX
3. `src/index.css` -- add 4 small utility classes for ERP invoice styling

