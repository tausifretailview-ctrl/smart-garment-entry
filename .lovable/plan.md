
# Add Size Selection Checkboxes to Product Entry

## Problem
When adding a new product, selecting a size group like "22-28" generates variants for ALL sizes (22, 24, 26, 28). If the user only needs size 26, they must manually delete the unwanted sizes one by one using the X button -- tedious and slow.

## Solution
After a size group is selected, display all sizes from that group as **checkboxes**. By default, all sizes are checked. The user can uncheck sizes they don't need before clicking "Generate Size Variants". Only checked sizes will be used to create variants.

## How It Works
1. User selects a size group (e.g., "22-28")
2. Below the dropdown, a row of checkbox chips appears: [x] 22  [x] 24  [x] 26  [x] 28
3. User unchecks sizes they don't want (e.g., uncheck 22, 24, 28 -- keep only 26)
4. Click "Generate Size Variants" -- only size 26 variants are created
5. A "Select All / Deselect All" toggle for quick bulk selection

## Technical Details

### File: `src/components/ProductEntryDialog.tsx`

1. **Add state** for selected sizes:
   ```typescript
   const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
   ```

2. **Update size group selection handler**: When a size group is selected, auto-populate `selectedSizes` with all sizes from that group (all checked by default).

3. **Render checkbox row** below the Size Group dropdown: Display each size as a compact checkbox chip. Include "All" / "None" quick toggle buttons.

4. **Modify `handleGenerateSizeVariants`**: Filter `selectedGroup.sizes` to only include sizes present in `selectedSizes` array before generating variants.

### UI Layout
The size checkboxes will appear as a compact inline row of small toggleable chips right below the Size Group selector, keeping the dialog clean and not adding extra height.
