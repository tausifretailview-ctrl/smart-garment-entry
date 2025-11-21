-- Complete data reset: Clear all transactional data and reset sequences
-- This will start bill series, barcode series, and software bill numbers from the beginning

-- 1. Delete all sale items first (foreign key dependency)
DELETE FROM sale_items;

-- 2. Delete all sales
DELETE FROM sales;

-- 3. Delete all purchase items
DELETE FROM purchase_items;

-- 4. Delete all purchase bills
DELETE FROM purchase_bills;

-- 5. Delete all stock movements
DELETE FROM stock_movements;

-- 6. Delete all batch stock
DELETE FROM batch_stock;

-- 7. Delete all product variants
DELETE FROM product_variants;

-- 8. Delete all products
DELETE FROM products;

-- 9. Delete all customers (optional - uncomment if you want to clear customers too)
-- DELETE FROM customers;

-- 10. Delete all suppliers (optional - uncomment if you want to clear suppliers too)
-- DELETE FROM suppliers;

-- 11. Reset barcode sequence to start from 10001001
DELETE FROM barcode_sequence;

-- 12. Reset bill number sequence to start fresh
DELETE FROM bill_number_sequence;

-- 13. Clear audit logs (optional - keeps history clean)
DELETE FROM audit_logs;

-- The sequences will automatically start from the beginning when new records are created:
-- - Barcodes will start from 10001001 (defined in generate_next_barcode function)
-- - Bill numbers will start from B[MM][YY]001 for each month
-- - Invoice numbers will start from INV/[YY-YY]/1 for each financial year