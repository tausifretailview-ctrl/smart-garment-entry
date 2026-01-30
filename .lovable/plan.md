

# Fix Sticky Header Overlap in Sale Billing and Other Windows

## Problem Summary

When scrolling in the Sale Billing (Sales Invoice) page, the sticky header section (containing customer info, invoice date, salesman selection, and product search bar) is being overlapped by the table header row as the table content scrolls. This creates a visual glitch where the table headers appear on top of or blend with the form controls.

---

## Root Cause Analysis

The Sales Invoice page has this structure:
```text
Card (overflow-hidden)
├── Sticky Header (z-20, bg-card) - Contains form controls
│   ├── Title, Customer selector, Dates, Tax Type
│   └── Product search, Entry mode toggle, Total Qty badge
└── Scrollable Table Container (max-h-[calc(100vh-420px)], overflow-y-auto)
    └── Table
        ├── TableHeader (sticky top-0 z-10) ← This is the issue
        └── TableBody (scrollable content)
```

**Issues Identified:**
1. The `TableHeader` component has `sticky top-0 z-10` built into the base component, which means table headers stick to their scroll container's top
2. When the table scrolls, its sticky header competes visually with the form's sticky header
3. The form's sticky header needs to properly clip/cover content scrolling beneath it

---

## Affected Pages

| Page | Has Sticky Header | Has Scrollable Table | Needs Fix |
|------|------------------|---------------------|-----------|
| SalesInvoice.tsx | Yes (z-20) | Yes | Yes |
| POSSales.tsx | Yes (z-20) | No (cart-based) | Check |
| PurchaseEntry.tsx | No | Yes (60vh) | No |
| QuotationEntry.tsx | No | No (uses ScrollArea) | No |
| SaleOrderEntry.tsx | No | No (uses ScrollArea) | No |
| Stock Report | No | Yes | No |
| Dashboards | No (filters not sticky) | Yes | No |

---

## Solution

### Fix 1: Remove Table Header Sticky Behavior in Scrollable Containers

For SalesInvoice.tsx specifically, override the TableHeader's sticky behavior since the form header is already sticky and provides the visual anchor:

**File:** `src/pages/SalesInvoice.tsx`

Change the TableHeader to disable its sticky behavior within the already-scrollable container:
```tsx
<TableHeader className="sticky-none">
```

Or add inline style to override:
```tsx
<TableHeader className="!static">
```

### Fix 2: Increase Form Sticky Header Z-Index and Add Solid Background

Ensure the form sticky header has a higher z-index and completely opaque background to fully cover anything scrolling beneath:

**File:** `src/pages/SalesInvoice.tsx` (around line 1891)

Current:
```tsx
<div className="sticky top-0 z-20 bg-card pb-4 -mt-6 pt-6 -mx-6 px-6 border-b border-border/50">
```

Change to:
```tsx
<div className="sticky top-0 z-30 bg-card pb-4 -mt-6 pt-6 -mx-6 px-6 border-b border-border shadow-sm">
```

### Fix 3: Add Isolation to Scrollable Container

Add `isolate` class to the scrollable table container to create a new stacking context:

```tsx
<div ref={tableContainerRef} className="max-h-[calc(100vh-420px)] overflow-y-auto mt-4 isolate">
```

### Fix 4: Override Table Header Z-Index Within Container

Pass a lower z-index to the TableHeader when it's inside the scrollable container:

```tsx
<TableHeader className="z-0">
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/SalesInvoice.tsx` | Increase sticky header z-index to z-30, add shadow, make table header non-sticky or z-0 |
| `src/pages/POSSales.tsx` | Verify sticky header has proper z-index (already z-20) |
| `src/components/ui/table.tsx` | Consider making TableHeader sticky behavior optional via prop |

---

## Implementation Details

### SalesInvoice.tsx Changes

1. **Line ~1891** - Update sticky header classes:
   - Change `z-20` to `z-30`
   - Add `shadow-sm` for visual separation
   - Ensure `border-b` is solid (not transparent)

2. **Line ~2293** - Update scrollable container:
   - Add `isolate` class to create stacking context

3. **Line ~2295** - Update TableHeader:
   - Add `className="z-0"` to ensure it stays below the form header

### Verification Checklist

After implementation, verify:
- Scroll the table - form header stays on top
- Table header remains visible while scrolling within the table area
- Dropdowns (customer search, date picker, tax type) still work and appear above everything
- The Total Qty badge in header remains visible

---

## Technical Notes

### Z-Index Hierarchy (Current vs Proposed)

| Element | Current Z-Index | Proposed Z-Index |
|---------|----------------|------------------|
| Main Header | z-50 | z-50 (unchanged) |
| Window Tabs Bar | none (normal flow) | none (unchanged) |
| Form Sticky Header | z-20 | z-30 |
| Popovers/Dropdowns | z-50 | z-50 (unchanged) |
| Table Header | z-10 | z-0 or static |
| Floating Elements | z-40 | z-40 (unchanged) |

### CSS Stacking Context

Adding `isolate` to the scrollable container creates a new stacking context, which means:
- Elements inside cannot escape to overlap elements outside
- The form sticky header above will always render on top
- Table's internal sticky elements work within their container only

