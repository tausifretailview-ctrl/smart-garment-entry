

# Customer Master Typography Enhancement

## Overview
Increase the typography scale in the Customer Master table from 13px to 14px for data cells, strengthen the customer name column, and adjust row height from h-11 to h-12 for better breathing room. Table headers stay at 12px for visual hierarchy.

## Changes (Single File: `src/pages/CustomerMaster.tsx`)

### 1. Table Headers
- Keep `text-[12px]` but change `font-bold` to `font-semibold` for a slightly softer header weight.

### 2. Customer Name Column
- Change from `text-[13px] font-semibold` to `text-[14px] font-semibold` to increase prominence.

### 3. All Data Cells
- Replace all `text-[13px]` with `text-[14px]` across every TableCell (Sr No, Mobile, Email, GST, Opening Balance, Advance, Discount, Status, Actions).
- Add `leading-5` to data cells for improved line-height.

### 4. Financial Columns (Opening Balance, Advance, Discount)
- Update to `text-[14px] font-medium tabular-nums` for accounting clarity.

### 5. Row Height
- Change `h-11` to `h-12` on all data TableRows to accommodate the larger font.

### 6. Empty/Loading State Cells
- Update loading and "No customers found" cells from `text-[13px]` to `text-[14px]`.

---

## Technical Details

**File**: `src/pages/CustomerMaster.tsx`

**Find and replace patterns**:
- All `text-[13px]` in TableCell elements become `text-[14px]`
- All `font-bold` in TableHead elements become `font-semibold`
- `h-11` on TableRow becomes `h-12`
- Add `leading-5` to data TableCells

**No changes to**: Business logic, data fetching, mutations, other files, or header font size (stays 12px).

