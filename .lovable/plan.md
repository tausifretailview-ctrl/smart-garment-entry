

## Show Product History for Zero-Stock Products

### Problem
When scanning barcode `0090001607` in POS, it shows "Product not found" because the product has 0 stock. The POS search currently filters out zero-stock items, preventing you from viewing the product's purchase and sale history.

### Solution
Update the POS barcode scan to show zero-stock products with an "Out of Stock" indicator instead of hiding them. This way you can still view the product details and access its transaction history (purchases, sales, returns).

### What Will Change

1. **POS barcode scan** -- When an exact barcode match is found but has zero stock, display the product with an "Out of Stock" badge instead of showing "Product not found"
2. **Product History button** -- Add a "History" button on the POS product card so you can quickly view the purchase/sale history of any scanned product, even with zero stock

### Technical Details

**Files to modify:**

- `src/pages/POSSales.tsx` -- Update the barcode scan/search logic to include exact barcode matches regardless of stock quantity. Add an "Out of Stock" visual indicator and prevent adding zero-stock items to the cart. Add a History button that opens the ProductHistoryDialog.

**No database changes needed.**

