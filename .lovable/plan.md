

## Problem

In the Purchase Add Product dialog, when the user scrolls down to the Size Variants section, there's no easy way to scroll back up to review product details (name, category, brand, pricing). The outer ScrollArea works but requires scrolling past the variants table area carefully.

## Solution: Add a floating "Back to Top" button

Add a small floating button inside the ScrollArea that appears when the user scrolls down past a threshold. Clicking it scrolls the form back to the top.

### Changes

**File: `src/components/ProductEntryDialog.tsx`**

1. Add a `ref` to the ScrollArea's viewport to track scroll position
2. Add a `useState` for `showBackToTop` (appears after scrolling 200px+)
3. Add an `onScroll` handler on the ScrollArea viewport
4. Render a small floating "↑ Product Details" button (positioned sticky at bottom-right of the scroll container) that scrolls to top on click
5. Style: small pill button with primary-light background, smooth scroll behavior

This gives users a one-click way to jump back to product details from anywhere in the form, without disrupting the existing scroll mechanics or variant table isolation.

