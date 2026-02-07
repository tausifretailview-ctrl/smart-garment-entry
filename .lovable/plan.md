

# Footwear Barcode Printing Improvements for KS

## Issues Identified

Based on the attached images and analysis:

| Issue | Current Behavior | Expected Behavior |
|-------|-----------------|-------------------|
| **Size Sorting** | Labels print in database order (random) | Footwear sizes should print in **descending order** (45→44→43...35) |
| **Top Margin** | PRN template adds unintended spacing | Clean label output without extra top margin |

## Root Cause Analysis

### 1. Size Sorting Issue
When loading items from a purchase bill via `handleLoadByBill()`, the items are not sorted by size. For footwear retail, workers need labels in **descending size order** (largest first) to match box stacking conventions.

**Current code (line ~1781-1810):**
```typescript
const loadedItems: LabelItem[] = itemsData
  .filter(item => item.sku_id && variantMap.has(item.sku_id))
  .map(item => { ... });
// No sorting applied
setLabelItems(loadedItems);
```

### 2. Top Margin Issue
Looking at the stored PRN templates for KS:
- The "ks" and "KS 50*25" templates have specific coordinates
- When barcodes appear to have extra top margin, it's typically due to the label roll's physical sensor calibration not matching the template's `GAP` command

The templates show: `GAP 3 mm, 0 mm` which may need adjustment, or the user's default format offset settings are being applied incorrectly.

## Proposed Solution

### Part 1: Add Size Sorting Options

Add a new control in the barcode printing page that allows users to choose size sort order:

| Option | Description | Use Case |
|--------|-------------|----------|
| **None** | Keep original order | General use |
| **Ascending** | Small to large (35→45) | Some workflows |
| **Descending** | Large to small (45→35) | **Footwear standard** |

### Part 2: Save Sort Preference per Organization

Store the sort preference in the organization's barcode label settings (via `barcode_label_settings` table) alongside the default format.

## Technical Implementation

### Files to Modify

| File | Changes |
|------|---------|
| `src/pages/BarcodePrinting.tsx` | Add size sort dropdown, apply sorting when loading items |
| `src/hooks/useBarcodeLabelSettings.tsx` | Include sort preference in default format |

### New UI Element

Add a "Size Order" dropdown in the quantity settings area:

```text
Quantity Mode: [Manual ▼]  Size Order: [Descending ▼]
                            ├─ None (Original)
                            ├─ Ascending (35→45)
                            └─ Descending (45→35) ← Default for footwear
```

### Sorting Logic

```typescript
type SizeSortOrder = 'none' | 'ascending' | 'descending';

const sortItemsBySize = (items: LabelItem[], order: SizeSortOrder): LabelItem[] => {
  if (order === 'none') return items;
  
  return [...items].sort((a, b) => {
    const sizeA = parseInt(a.size) || 0;
    const sizeB = parseInt(b.size) || 0;
    return order === 'descending' ? sizeB - sizeA : sizeA - sizeB;
  });
};
```

### Apply Sorting After Loading

When items are loaded from:
1. Purchase bill (`handleLoadByBill`)
2. Navigation state (`location.state?.purchaseItems`)
3. Individual product search (`handleAddItem`)

Apply the sort based on user preference:
```typescript
setLabelItems(sortItemsBySize(loadedItems, sizeSortOrder));
```

### Persist Setting

Add `sizeSortOrder` to the default format saved in `barcode_label_settings`:
```typescript
interface DefaultFormat {
  defaultTemplate?: string | null;
  sheetType?: string;
  sizeSortOrder?: 'none' | 'ascending' | 'descending';  // NEW
  topOffset?: number;
  // ... existing fields
}
```

## Changes Summary

1. **New State Variable:** `sizeSortOrder` with default `'none'`
2. **New Dropdown:** Size Order selector in the quantity settings section
3. **Sorting Function:** `sortItemsBySize()` utility for natural numeric sorting
4. **Apply on Load:** Sort items when loading from bills or navigation state
5. **Apply on Change:** Re-sort items when user changes the sort order
6. **Save Preference:** Include in `saveDefaultFormat` call

## Benefits

- Footwear retailers can set descending order once and it persists
- Flexible for other industries that may want ascending order
- Non-intrusive "None" option for those who don't need sorting
- Works with all loading methods (by bill, manual search, navigation)

