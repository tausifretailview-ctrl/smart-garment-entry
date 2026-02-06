

# Plan: Safe Customer Duplicate Merge for SM Hair Replacement

## Summary

This plan provides SQL queries to safely merge 122 duplicate customer groups (246 records) in the SM Hair Replacement organization, preserving all sales history and linked records.

## Duplicate Analysis

| Metric | Count |
|--------|-------|
| Duplicate phone groups | 122 |
| Total duplicate records | 246 |
| Sales affected | 353 |
| Legacy invoices | 8,073 |
| Customer product prices | 436 |

## Tables with Customer References

| Table | Has Foreign Key | Records |
|-------|-----------------|---------|
| sales | Yes | 1,751 |
| legacy_invoices | Yes | 8,073 |
| customer_product_prices | Yes | 436 |
| sale_orders | Yes | 0 |
| quotations | Yes | 0 |
| sale_returns | Yes | 0 |
| delivery_challans | Yes | 0 |
| credit_notes | Yes | 0 |
| customer_advances | Yes | 0 |
| customer_points_history | Yes | 0 |
| customer_brand_discounts | Yes | 0 |
| payment_links | Yes | 0 |
| gift_redemptions | Yes | 0 |

---

## Safe Merge Queries

### Step 1: Preview Duplicate Groups (Read-Only)

This query shows all duplicate groups with their sales counts to help identify which customer to keep as the "primary":

```sql
-- Preview duplicates before merging
WITH normalized AS (
  SELECT 
    id,
    customer_name,
    phone,
    RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) as normalized_phone,
    created_at,
    opening_balance
  FROM customers
  WHERE organization_id = 'ceb7f3dd-3619-4718-a8c1-43a02252e5b9'
    AND deleted_at IS NULL
    AND phone IS NOT NULL
    AND LENGTH(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 10
),
duplicates AS (
  SELECT normalized_phone, COUNT(*) as cnt
  FROM normalized
  GROUP BY normalized_phone
  HAVING COUNT(*) > 1
)
SELECT 
  n.normalized_phone,
  n.id,
  n.customer_name,
  n.phone,
  n.created_at,
  COALESCE(n.opening_balance, 0) as opening_balance,
  (SELECT COUNT(*) FROM sales s WHERE s.customer_id = n.id AND s.deleted_at IS NULL) as sales_count,
  (SELECT COUNT(*) FROM legacy_invoices li WHERE li.customer_id = n.id) as legacy_count
FROM normalized n
JOIN duplicates d ON n.normalized_phone = d.normalized_phone
ORDER BY n.normalized_phone, sales_count DESC, n.created_at
```

### Step 2: Create Primary Customer Mapping Table

Creates a temporary mapping that identifies the "primary" customer for each duplicate group (the one with most sales, or oldest if tied):

```sql
-- Create a mapping of duplicate -> primary customer
CREATE TEMP TABLE customer_merge_map AS
WITH normalized AS (
  SELECT 
    id,
    customer_name,
    phone,
    opening_balance,
    RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) as normalized_phone,
    created_at
  FROM customers
  WHERE organization_id = 'ceb7f3dd-3619-4718-a8c1-43a02252e5b9'
    AND deleted_at IS NULL
    AND phone IS NOT NULL
    AND LENGTH(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 10
),
ranked AS (
  SELECT 
    n.*,
    (SELECT COUNT(*) FROM sales s WHERE s.customer_id = n.id AND s.deleted_at IS NULL) as sales_count,
    ROW_NUMBER() OVER (
      PARTITION BY n.normalized_phone 
      ORDER BY 
        (SELECT COUNT(*) FROM sales s WHERE s.customer_id = n.id AND s.deleted_at IS NULL) DESC,
        n.created_at ASC
    ) as rn
  FROM normalized n
),
primaries AS (
  SELECT id as primary_id, normalized_phone
  FROM ranked WHERE rn = 1
)
SELECT 
  r.id as duplicate_id,
  p.primary_id,
  r.normalized_phone,
  r.customer_name as duplicate_name,
  (SELECT customer_name FROM customers WHERE id = p.primary_id) as primary_name,
  r.sales_count
FROM ranked r
JOIN primaries p ON r.normalized_phone = p.normalized_phone
WHERE r.id != p.primary_id;
```

### Step 3: Reassign All Linked Records

These UPDATE statements move all records from duplicate customers to their primary:

```sql
-- 3a. Reassign sales
UPDATE sales s
SET customer_id = m.primary_id
FROM customer_merge_map m
WHERE s.customer_id = m.duplicate_id;

-- 3b. Reassign legacy_invoices
UPDATE legacy_invoices li
SET customer_id = m.primary_id
FROM customer_merge_map m
WHERE li.customer_id = m.duplicate_id;

-- 3c. Reassign customer_product_prices (merge or update)
-- First, delete duplicates that would conflict
DELETE FROM customer_product_prices cpp
WHERE EXISTS (
  SELECT 1 FROM customer_merge_map m
  WHERE cpp.customer_id = m.duplicate_id
    AND EXISTS (
      SELECT 1 FROM customer_product_prices cpp2
      WHERE cpp2.customer_id = m.primary_id
        AND cpp2.variant_id = cpp.variant_id
    )
);

-- Then update remaining
UPDATE customer_product_prices cpp
SET customer_id = m.primary_id
FROM customer_merge_map m
WHERE cpp.customer_id = m.duplicate_id;

-- 3d. Reassign sale_orders (if any)
UPDATE sale_orders so
SET customer_id = m.primary_id
FROM customer_merge_map m
WHERE so.customer_id = m.duplicate_id;

-- 3e. Reassign quotations (if any)
UPDATE quotations q
SET customer_id = m.primary_id
FROM customer_merge_map m
WHERE q.customer_id = m.duplicate_id;

-- 3f. Reassign sale_returns (if any)
UPDATE sale_returns sr
SET customer_id = m.primary_id
FROM customer_merge_map m
WHERE sr.customer_id = m.duplicate_id;

-- 3g. Reassign delivery_challans (if any)
UPDATE delivery_challans dc
SET customer_id = m.primary_id
FROM customer_merge_map m
WHERE dc.customer_id = m.duplicate_id;

-- 3h. Reassign credit_notes (if any)
UPDATE credit_notes cn
SET customer_id = m.primary_id
FROM customer_merge_map m
WHERE cn.customer_id = m.duplicate_id;

-- 3i. Reassign customer_advances (if any)
UPDATE customer_advances ca
SET customer_id = m.primary_id
FROM customer_merge_map m
WHERE ca.customer_id = m.duplicate_id;

-- 3j. Reassign customer_points_history (if any)
UPDATE customer_points_history cph
SET customer_id = m.primary_id
FROM customer_merge_map m
WHERE cph.customer_id = m.duplicate_id;

-- 3k. Reassign customer_brand_discounts (delete conflicting first)
DELETE FROM customer_brand_discounts cbd
WHERE EXISTS (
  SELECT 1 FROM customer_merge_map m
  WHERE cbd.customer_id = m.duplicate_id
    AND EXISTS (
      SELECT 1 FROM customer_brand_discounts cbd2
      WHERE cbd2.customer_id = m.primary_id
        AND cbd2.brand = cbd.brand
    )
);

UPDATE customer_brand_discounts cbd
SET customer_id = m.primary_id
FROM customer_merge_map m
WHERE cbd.customer_id = m.duplicate_id;

-- 3l. Reassign payment_links (if any)
UPDATE payment_links pl
SET customer_id = m.primary_id
FROM customer_merge_map m
WHERE pl.customer_id = m.duplicate_id;

-- 3m. Reassign gift_redemptions (if any)
UPDATE gift_redemptions gr
SET customer_id = m.primary_id
FROM customer_merge_map m
WHERE gr.customer_id = m.duplicate_id;
```

### Step 4: Normalize Primary Customer Phone Numbers

Update the primary customer records to use normalized 10-digit phone format:

```sql
-- Normalize phone numbers on primary customers
UPDATE customers c
SET phone = RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10)
WHERE organization_id = 'ceb7f3dd-3619-4718-a8c1-43a02252e5b9'
  AND deleted_at IS NULL
  AND phone IS NOT NULL
  AND LENGTH(phone) > 10;
```

### Step 5: Soft-Delete Duplicate Customers

Mark duplicate customers as deleted (preserves audit trail):

```sql
-- Soft-delete the duplicate customers
UPDATE customers c
SET 
  deleted_at = NOW(),
  deleted_by = NULL  -- or a specific admin user ID if available
FROM customer_merge_map m
WHERE c.id = m.duplicate_id;
```

### Step 6: Verification Query

Confirm no duplicates remain:

```sql
-- Verify no more duplicates
SELECT 
  RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) as normalized_phone,
  COUNT(*) as cnt
FROM customers
WHERE organization_id = 'ceb7f3dd-3619-4718-a8c1-43a02252e5b9'
  AND deleted_at IS NULL
  AND phone IS NOT NULL
  AND LENGTH(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 10
GROUP BY 1
HAVING COUNT(*) > 1;
-- Should return 0 rows
```

---

## Complete Single-Transaction Script

For safety, run all steps in a single transaction:

```sql
BEGIN;

-- Step 2: Create mapping (inline CTE version)
-- Step 3: All reassignments
-- Step 4: Normalize phones
-- Step 5: Soft-delete duplicates

-- If anything fails, ROLLBACK
-- If successful, COMMIT

COMMIT;
```

---

## Important Notes

1. **Backup First**: Always take a database backup before running merge operations
2. **Test Environment**: Run on a test copy first if possible
3. **Transaction Safety**: All operations should run in a single transaction
4. **Opening Balance**: The primary customer keeps their opening balance; consider manually merging balances if both duplicates have non-zero values
5. **Points Balance**: If loyalty points are used, may need additional logic to sum points from duplicates

## Expected Outcome

After running these queries:
- 122 duplicate customer records will be soft-deleted
- 353+ sales records will point to the correct primary customer
- All legacy invoices and product prices will be consolidated
- Phone numbers will be normalized to 10-digit format
- Customer ledger and reports will show accurate consolidated history

