
## Field Sales Size Grid - Show All Colors at Once

### Problem
The current Field Sales order entry requires selecting one color at a time to enter size quantities. This is slower for salesmen who need to quickly enter quantities across all colors in a single view.

### Screenshot Reference
- **Desired (Old Style)**: All colors (MR, RED, BLUE, BK) visible with size input boxes for each color shown simultaneously
- **Current (New Style)**: Shows "Select Color" first, requiring individual color selection

### Solution
Update the `SalesmanSizeGridDialog` component to display all colors with their size grids simultaneously, similar to how the desktop `SizeGridDialog` works with `allowMultiColor=true`.

---

### Technical Changes

**File: `src/components/SalesmanSizeGridDialog.tsx`**

1. **Add Multi-Color State Management**
   - Add state for tracking quantities per color: `multiColorQty` 
   - Add state for custom sizes per color: `multiColorCustomSizes`
   - Add state for active custom size color: `activeCustomSizeColor`

2. **Replace Color Selection UI with Multi-Color Grid**
   - Remove the "Select Color" step for multi-color products
   - Show all colors in a vertical layout with:
     - Color badge and running quantity total
     - Size input boxes for each color's variants
     - "Add Size" button per color for custom sizes
   - Add "Add Colour" button at bottom for adding new colors

3. **Update Confirm Logic**
   - Collect items from all colors at once
   - Build combined items array from `multiColorQty` state

4. **Reset Logic Update**
   - Initialize multi-color states on dialog open
   - Clear all color quantities on close

### User Experience Changes

| Before | After |
|--------|-------|
| Select color first | See all colors at once |
| Enter quantities for one color | Enter quantities for any/all colors |
| Must go back to add another color | Submit everything in one go |
| ~3 taps per color to start entry | ~1 tap per size to enter quantity |

### Layout Structure

```text
+-------------------------------------------+
| Enter Size-wise Quantity              [X] |
| PUL61                        + Add Colour |
+-------------------------------------------+
| [MR]                             Qty: 0   |
|   5    6    3    9    7    8    4         |
|  [_]  [_]  [_]  [_]  [_]  [_]  [_]       |
|  + Add Size                               |
+-------------------------------------------+
| [RED]                            Qty: 0   |
|   3    6    9    7    5    4    8         |
|  [_]  [_]  [_]  [_]  [_]  [_]  [_]       |
|  + Add Size                               |
+-------------------------------------------+
| [BLUE]                           Qty: 0   |
|   3    9    8    7    5    4    6         |
|  [_]  [_]  [_]  [_]  [_]  [_]  [_]       |
|  + Add Size                               |
+-------------------------------------------+
| [BK]                             Qty: 0   |
|   9    8    6    7    4    5    3         |
|  [_]  [_]  [_]  [_]  [_]  [_]  [_]       |
|  + Add Size                               |
+-------------------------------------------+
|              + Add Colour                 |
+-------------------------------------------+
| Total Quantity (All Colors):          0   |
+-------------------------------------------+
|              [Cancel]     [Confirm]       |
+-------------------------------------------+
```

### Implementation Notes
- Size order will respect the product's size group ordering
- Stock quantities shown below each size (when `showStock=true`)
- Custom sizes can be added per-color with the "+ Add Size" button
- New colors added via "+ Add Colour" get empty variant slots
- Focus automatically moves to first input on open
