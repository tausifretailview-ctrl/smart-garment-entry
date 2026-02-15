

# Fix: Always Show Quick Service Dialog for Shortcodes 1-9

## Problem
A real product exists with barcode "1" (READYMADE, NBC). The current logic searches the database first and finds this product, so it gets added directly without showing the Qty/MRP dialog. The user wants single-digit codes (1-9) to **always** open the quick service dialog.

## Solution
Move the quick service shortcode check back to the **top** of the `searchAndAddProduct` function, before any barcode lookup. This ensures typing "1" through "9" always opens the dialog for Qty and MRP entry.

## Changes

**File: `src/pages/POSSales.tsx`**

In the `searchAndAddProduct` function (around line 873):
- Move the `/^[1-9]$/` check to the very first line of the function, before the `productsData` check and barcode search
- Remove the duplicate check at line 903-908 (the fallback after barcode search)
- Remove the duplicate check inside the `!productsData` block (lines 876-881)

The corrected flow:
1. User types "1" and presses Enter
2. Function immediately detects single-digit shortcode
3. Opens QuickServiceProductDialog asking for Qty and MRP
4. User enters values and confirms
5. Service item added to cart

This matches the user's expected behavior shown in the screenshots -- a floating window asking for Qty, MRP, and Discount before adding.

