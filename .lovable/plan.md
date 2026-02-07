

## Delete All Data for ELLA NOOR Organization (Fresh Start)

### Overview
Permanently delete all trial data for the ELLA NOOR organization and reset the barcode sequence to start fresh. This will **ONLY** affect ELLA NOOR - no other organizations will be touched.

### Organization Details
- **Name:** ELLA NOOR
- **ID:** `3fdca631-1e0c-4417-9704-421f5129ff67`
- **Created:** January 10, 2026
- **Current Barcode:** 90001058 (will reset to 90001001)

### Data to be Permanently Deleted

| Category | Table | Records |
|----------|-------|---------|
| **Products** | products | 59 (32 active + 27 deleted) |
| | product_variants | 83 |
| | size_groups | 3 |
| **Customers** | customers | 15 (all in recycle bin) |
| **Suppliers** | suppliers | 2 |
| **Sales** | sales | 19 (all in recycle bin) |
| | sale_items | 25 |
| | sale_returns | 1 |
| | sale_return_items | (linked) |
| **Purchases** | purchase_bills | 3 (all in recycle bin) |
| | purchase_returns | 1 |
| | purchase_return_items | (linked) |
| **Inventory** | stock_movements | 219 |
| | batch_stock | 59 |
| **Settings** | barcode_sequence | Reset to 90001001 |
| | bill_number_sequence | Reset |

### Deletion Order (respects foreign keys)

The delete must happen in specific order to avoid foreign key violations:

```text
1. sale_items (depends on sales)
2. sale_return_items (depends on sale_returns)
3. purchase_return_items (depends on purchase_returns)
4. quotation_items (depends on quotations)
5. sale_order_items (depends on sale_orders)
6. purchase_order_items (depends on purchase_orders)
7. delivery_challan_items (depends on delivery_challans)
8. stock_movements (depends on variants)
9. batch_stock (depends on variants)
10. sale_returns (depends on sales)
11. purchase_returns (depends on purchase_bills)
12. sales (depends on customers)
13. purchase_bills (depends on suppliers)
14. quotations
15. sale_orders
16. purchase_orders
17. delivery_challans
18. credit_notes
19. customer_advances
20. customer_brand_discounts
21. customer_product_prices
22. product_variants (depends on products)
23. products
24. customers
25. suppliers
26. size_groups
27. barcode_sequence (RESET to 90001001)
28. bill_number_sequence (DELETE)
```

### SQL Migration Script

```sql
-- ============================================
-- DELETE ALL DATA FOR ELLA NOOR ORGANIZATION
-- Organization ID: 3fdca631-1e0c-4417-9704-421f5129ff67
-- ============================================
-- This script ONLY affects ELLA NOOR organization
-- All other organizations remain untouched

BEGIN;

-- 1. Delete sale items first (child records)
DELETE FROM sale_items 
WHERE sale_id IN (
  SELECT id FROM sales 
  WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
);

-- 2. Delete sale return items
DELETE FROM sale_return_items 
WHERE sale_return_id IN (
  SELECT id FROM sale_returns 
  WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
);

-- 3. Delete purchase return items
DELETE FROM purchase_return_items 
WHERE purchase_return_id IN (
  SELECT id FROM purchase_returns 
  WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
);

-- 4. Delete quotation items
DELETE FROM quotation_items 
WHERE quotation_id IN (
  SELECT id FROM quotations 
  WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
);

-- 5. Delete sale order items
DELETE FROM sale_order_items 
WHERE sale_order_id IN (
  SELECT id FROM sale_orders 
  WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
);

-- 6. Delete purchase order items
DELETE FROM purchase_order_items 
WHERE purchase_order_id IN (
  SELECT id FROM purchase_orders 
  WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
);

-- 7. Delete delivery challan items
DELETE FROM delivery_challan_items 
WHERE delivery_challan_id IN (
  SELECT id FROM delivery_challans 
  WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
);

-- 8. Delete stock movements
DELETE FROM stock_movements 
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 9. Delete batch stock
DELETE FROM batch_stock 
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 10. Delete sale returns
DELETE FROM sale_returns 
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 11. Delete purchase returns
DELETE FROM purchase_returns 
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 12. Delete sales (including soft-deleted in recycle bin)
DELETE FROM sales 
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 13. Delete purchase bills (including soft-deleted)
DELETE FROM purchase_bills 
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 14. Delete quotations
DELETE FROM quotations 
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 15. Delete sale orders
DELETE FROM sale_orders 
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 16. Delete purchase orders
DELETE FROM purchase_orders 
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 17. Delete delivery challans
DELETE FROM delivery_challans 
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 18. Delete credit notes
DELETE FROM credit_notes 
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 19. Delete customer advances
DELETE FROM customer_advances 
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 20. Delete customer brand discounts
DELETE FROM customer_brand_discounts 
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 21. Delete customer product prices
DELETE FROM customer_product_prices 
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 22. Delete product variants
DELETE FROM product_variants 
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 23. Delete products (including soft-deleted)
DELETE FROM products 
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 24. Delete customers (including soft-deleted in recycle bin)
DELETE FROM customers 
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 25. Delete suppliers
DELETE FROM suppliers 
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 26. Delete size groups
DELETE FROM size_groups 
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 27. Reset barcode sequence to starting value (90001001)
UPDATE barcode_sequence 
SET next_barcode = 90001001, updated_at = NOW()
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 28. Delete bill number sequences
DELETE FROM bill_number_sequence 
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

COMMIT;
```

### Safety Measures

1. **Organization-Scoped:** Every DELETE statement includes `organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'` to ensure ONLY ELLA NOOR data is affected
2. **Transaction Wrapped:** All operations are within BEGIN/COMMIT for atomicity
3. **Foreign Key Order:** Deletion follows proper order to avoid constraint violations

### Summary of Changes

| Action | Description |
|--------|-------------|
| DELETE | All products, variants, and size groups |
| DELETE | All customers (15 records) |
| DELETE | All suppliers (2 records) |
| DELETE | All sales and sale items (19 sales, 25 items) |
| DELETE | All purchase bills |
| DELETE | All returns (sale and purchase) |
| DELETE | All stock movements (219 records) |
| DELETE | All batch stock (59 records) |
| DELETE | Recycle bin completely cleared |
| RESET | Barcode sequence back to 90001001 |
| RESET | Bill number sequences cleared |

### After Completion
- ELLA NOOR will have a completely clean slate
- Barcode series starts fresh from 90001001
- All bill numbers start from 1
- No data in recycle bin
- Ready for new entries

