

## Fix: Remove Auto-Focus on Search Bar After Adding New Product

### Problem
After adding a new product via the "Add New Product" dialog, the cursor auto-focuses on the search bar (line 930 in `PurchaseEntry.tsx`). This prevents the user from pressing "1" to quickly open the Add New Product dialog again, because the "1" keystroke gets typed into the search input instead.

### Fix
**File: `src/pages/PurchaseEntry.tsx`**

1. **Line 930**: Remove or comment out `setTimeout(() => inlineSearchInputRef.current?.focus(), 100)` — the line that focuses the search bar after product is added with qty.

2. **Line 1475-1477**: Similarly remove the `setTimeout(() => inlineSearchInputRef.current?.focus(), 100)` after Size Grid mode adds items — same issue applies there.

3. After both operations, add `document.activeElement?.blur()` to ensure no input has focus, so the "1" keyboard shortcut works immediately.

### What stays unchanged
- The "1" shortcut logic itself
- All other focus behaviors (supplier invoice field guard, etc.)
- Search bar still focusable by clicking on it manually

