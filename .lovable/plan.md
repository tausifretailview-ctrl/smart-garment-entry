
# Fix: RetailTemplate Footer Layout

## Problem
The current footer uses `rowSpan` on the left column within the items table, causing uneven stretching and misalignment between the terms/signature area and the totals summary.

## Solution
Replace the `rowSpan`-based footer (lines 324-421) with a **separate grid-based footer section** outside the items table. The header and items table remain untouched.

## Changes (single file: `RetailTemplate.tsx`)

### 1. End the items table after the "Total Qty / Sub Total" row (line 322)
Close `</tbody></table>` right after the totals row at line 322. Remove everything from line 324 to line 421 (the rowSpan footer block).

### 2. Add a new grid-based footer div after the table

```
<div style="display: grid; grid-template-columns: 70% 30%; border-top: 1px solid #000;">
```

**Left Column (70%):**
- Terms and Conditions (if any)
- Notes (if any)
- QR code (if any)
- "E. & O.E." text
- Bottom area with "Receiver's Signature" (left) and empty space

**Right Column (30%):**
- Structured rows, each 30px height, 1px black borders:
  - Discount (if > 0)
  - S/R Adjust (if > 0)
  - **Grand Total** (bold, double top border, slightly larger font, light gray background)
  - Received
  - Balance
  - Prev. Balance (if > 0)
  - **TOTAL DUE** (if > 0, bold, larger font)
- Authorized Signatory at bottom right

### 3. Layout details
- Each summary row: `display: flex; justify-content: space-between; height: 30px; align-items: center; border-bottom: 1px solid #000; padding: 0 8px`
- Grand Total row gets `border-top: 2px solid #000`
- Left column has `border-right: 1px solid #000` to separate from right
- Signature area at bottom uses flex with space-between for left/right signatures
- Add `page-break-inside: avoid` to the footer div for print

### 4. Print CSS
Add to existing `@media print` block:
```css
.retail-footer { page-break-inside: avoid; }
```

## What stays the same
- Header section (company name, address, logo)
- Bill Of Supply title
- Bill To / Invoice Info section
- Items table with column widths and alignment
- Total Qty / Sub Total row
