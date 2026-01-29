
# Plan: Sticky Header Section for Sales Invoice

## Overview
Implement a sticky header section in the Sales Invoice page that keeps the invoice header (title, customer fields, salesman, entry mode toggle, search/scan bars, and total qty) visible while scrolling through a large list of product items.

## Current Behavior
- The entire page scrolls as one unit
- When adding many products, the search/scan bar disappears from view
- Users need to scroll back up to add more products

## Desired Behavior (Based on Reference Screenshots)
- **Sticky Section**: Everything from "New Invoice" title down to the "Total Qty" badge should remain fixed at the top
- **Scrollable Section**: Only the line items table should scroll independently
- The header remains accessible for quick product scanning/searching regardless of how many items are in the table

## Technical Approach

### File to Modify
- `src/pages/SalesInvoice.tsx`

### Implementation Details

1. **Restructure the Card Layout**
   - Split the Card content into two sections:
     - **Sticky header container**: Contains title, customer/invoice fields, salesman, entry mode, search bars, and total qty badge
     - **Scrollable body**: Contains the line items table and summary section

2. **Apply CSS for Sticky Behavior**
   - Add `sticky top-0 z-20 bg-card` to the header section wrapper
   - The table container will naturally scroll within the card
   - Set a `max-height` on the table container (e.g., `max-h-[calc(100vh-400px)]`) to create the scrollable area
   - Add `overflow-y-auto` to the table section

3. **Layout Structure**
   ```
   <Card className="p-6 relative">
     {/* Sticky Header Section */}
     <div className="sticky top-0 z-20 bg-card pb-4 -mt-6 pt-6 -mx-6 px-6">
       - Title row with Total Qty and Last Invoice
       - Customer, Invoice No, Dates, Tax Type fields
       - Salesman dropdown
       - Entry Mode toggle, Scan barcode, Browse Products, Total Qty badge
     </div>
     
     {/* Scrollable Items Section */}
     <div className="max-h-[calc(100vh-420px)] overflow-y-auto">
       - Line Items Table
       - Total Qty Row
     </div>
     
     {/* Summary Section (outside scroll) */}
     - Gross Amount, Discounts, Net Amount
     - Notes
     - Action Buttons
   </Card>
   ```

4. **Ensure Proper Z-Index Stacking**
   - Header section: `z-20`
   - Table header inside scroll area: `z-10` (already set in TableHeader component)
   - This ensures the sticky header overlays the scrolling table content

5. **Background Color Handling**
   - Add `bg-card` to ensure the sticky header doesn't show through content when scrolling
   - Match the card's background color for seamless appearance

## Visual Result
After implementation:
- The header (title through total qty row) stays fixed at top of the card
- The items table scrolls independently within a bounded area
- Scanning barcodes and searching products is always accessible
- Summary totals and action buttons remain visible below the scrollable table

## Edge Cases Handled
- Works with both small and large item lists
- Maintains functionality of all popovers (customer search, product search)
- Preserves keyboard navigation and focus management for barcode scanning
