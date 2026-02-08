

# Make Invoice Time Display More Visible

## Issue

The time display under invoice numbers is currently styled with `text-muted-foreground`, making it too light and hard to read.

## Solution

Change the time text color from muted to a darker, more readable color while keeping the smaller font size.

## Changes

| File | Current | Updated |
|------|---------|---------|
| `src/pages/POSDashboard.tsx` | `text-xs text-muted-foreground` | `text-xs text-foreground/70` |
| `src/pages/SalesInvoiceDashboard.tsx` | `text-xs text-muted-foreground` | `text-xs text-foreground/70` |

## Visual Result

**Before:** Light gray time (hard to read)
```
POS/25-26/8
02:45 PM  ← barely visible
```

**After:** Darker time (clearly visible)
```
POS/25-26/8
02:45 PM  ← easy to read
```

The `text-foreground/70` class uses 70% opacity of the main text color, making it darker than muted but still slightly subdued to maintain visual hierarchy with the invoice number.

