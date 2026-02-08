

# Add "Showing X of Y" Indicator & Load More for Product Search

## Problem
When product search returns more than 100 results, users have no indication that additional matches exist. For example, searching "LWR ARM" might match 120 products, but only 100 are shown without any feedback.

---

## Solution Overview

Add a smart indicator that shows when search results are truncated, with an option to load more results. This keeps the UI fast while giving users visibility into the full result set.

---

## What Will Be Changed

### 1. Add "Showing X of Y" Indicator to Dropdown Search

Display a subtle indicator at the top of the search results when the list is truncated:

**Visual Example:**
```
┌─────────────────────────────────────────┐
│ Search: LWR ARM                         │
├─────────────────────────────────────────┤
│ Showing 100 of 145 results • Load More  │
├─────────────────────────────────────────┤
│ LWR ARM - Size 28 - Stock: 45          │
│ LWR ARM - Size 30 - Stock: 32          │
│ ...                                     │
└─────────────────────────────────────────┘
```

### 2. Count Total Matching Variants (Not Just Products)

Currently, `filteredProducts` counts products, but each product has multiple variants. The indicator will count the total number of variant items that would be displayed to give an accurate count.

### 3. "Load More" Functionality

When clicked, increase the display limit to 200 (then 300, etc.) in increments of 100 to show additional results without overwhelming the UI.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/QuotationEntry.tsx` | Add indicator above CommandGroup, track displayLimit state, count total variants |
| `src/pages/SaleOrderEntry.tsx` | Same changes as QuotationEntry |
| `src/pages/QuotationEntry.tsx` | Add indicator to inline search results (keyboard navigation mode) |

---

## Technical Implementation

### New State Variable
```typescript
const [displayLimit, setDisplayLimit] = useState(100);
```

### Total Variant Count Calculation
```typescript
// Count total matching variants (not just products)
const totalMatchingVariants = filteredProducts.reduce(
  (count, product) => count + (product.product_variants?.length || 0), 
  0
);
```

### Truncation Indicator Component
```typescript
{totalMatchingVariants > displayLimit && (
  <div className="px-3 py-2 text-sm text-muted-foreground bg-muted/50 border-b flex items-center justify-between">
    <span>Showing {displayLimit} of {totalMatchingVariants} results</span>
    <Button
      variant="link"
      size="sm"
      className="h-auto p-0 text-primary"
      onClick={() => setDisplayLimit(prev => prev + 100)}
    >
      Load More
    </Button>
  </div>
)}
```

### Updated Slice Logic
```typescript
// Replace .slice(0, 100) with dynamic limit
{filteredProducts.slice(0, displayLimit).map(product => ...)}
```

### Reset Limit on New Search
```typescript
// Reset display limit when search changes
useEffect(() => {
  setDisplayLimit(100);
}, [searchInput]);
```

---

## Inline Search Enhancement (Bonus)

For the keyboard-navigable inline search in QuotationEntry, add a small indicator when results are capped at 100:

```typescript
{inlineSearchResults.length >= 100 && (
  <div className="px-2 py-1 text-xs text-muted-foreground text-center border-t">
    Showing first 100 results • Refine your search for more specific matches
  </div>
)}
```

---

## Result

After this implementation:
- Users will see "Showing 100 of 145 results" when search finds more than 100 matches
- "Load More" button allows viewing additional results in 100-item increments
- Display limit resets when the search term changes
- Inline search shows a helpful message when hitting the 100-result cap
- No impact on performance - results still load quickly with debouncing

