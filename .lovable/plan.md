

## Size Stock Report: Consolidate Multi-Color Products into Single Search Entry

### Problem
Currently, when searching for a product like "FL475" in the Size Stock report, each color variant (BLUE, NAVY, etc.) shows as a separate search result. The customer wants to see ONE entry per product name, and when selected, the grid should show all colors together.

### Solution
Group search results by product name (stripping color from the display in search dropdown) and when a grouped product is selected, fetch and display variants for ALL matching product IDs. The grid already handles multi-color display (separate row per color), so the main change is in the search and selection logic.

### Technical Changes

**File: `src/components/SizeStockDialog.tsx`**

1. **Change Product interface and search grouping**
   - Add a `productIds` array field to the `Product` interface to hold all product IDs sharing the same base name
   - After fetching search results, group products by a normalized key (product_name + brand + category + style, excluding color) so that FL475|RLX|MN|FL with BLUE and NAVY become one entry
   - Show all available colors as badges/text in the search dropdown item (e.g., "FL475 | RLX | MN | FL -- Colors: BLUE, NAVY")

2. **Update search dropdown display**
   - Show consolidated product with all colors listed
   - Show barcode from the first variant and price info as before

3. **Update selection logic**
   - When a grouped product is selected, store all its product IDs in `selectedProducts`
   - Update `loadStockData` to use all product IDs from the group, not just one

4. **Update stock data loading**
   - The `.in("product_id", productIds)` query already supports multiple IDs
   - The grid already groups by `product_id + color` and shows separate rows per color -- no changes needed there

5. **Update selected product tags display**
   - Show the consolidated product name (without color) in the tag chips

### What stays the same
- The stock grid table (already shows separate rows per color with totals)
- PDF export logic
- Size sorting logic
