

# Plan: Product Deletion Protection with Relation Chart

## Overview

This plan implements strict deletion protection for products (and other entities) that have transaction relationships, and creates a backend "Product Relation Chart" function to clearly identify all dependencies.

## Current State

The system already has protection in place:
- **ProductDashboard.tsx**: Checks for transactions before soft delete (lines 316-341, 345-391)
- **useProductProtection.tsx**: Hook that checks 7 transaction tables
- **useSoftDelete.tsx**: Blocks hard delete for products with transactions (lines 202-213)

However, the error messages could be clearer and there's no database-level view of product relationships.

---

## Changes Required

### 1. Backend: Create Product Relation Chart Function

Create a database function that returns all transaction relationships for a product, showing exactly where it's used.

**New Database Function:** `get_product_relations(p_product_id UUID)`

Returns a detailed breakdown:
- Sales count and invoice numbers
- Purchase count and bill numbers  
- Sale Returns count
- Purchase Returns count
- Quotations count
- Sale Orders count
- Delivery Challans count
- Total transaction count

This provides a "relation chart" view of any product's usage across the system.

### 2. Frontend: Enhanced Error Dialog

**File:** `src/pages/ProductDashboard.tsx`

Replace the simple toast message with a detailed AlertDialog that shows:
- Clear "You cannot delete this product" message
- List of transaction types where product is used
- Count of transactions in each type
- Recommendation to mark as inactive instead

### 3. Frontend: Update useProductProtection Hook

**File:** `src/hooks/useProductProtection.tsx`

Add a new function `getProductRelationDetails()` that:
- Returns counts for each transaction type (not just boolean)
- Provides specific transaction details for better user messaging

### 4. Consistent Messaging Across Application

Ensure the same protection and messaging applies to:
- Single product delete (from action menu)
- Bulk product delete (multi-select)
- Hard delete from Recycle Bin (already protected)

---

## Technical Implementation

### Database Migration

```sql
-- Function to get complete product relation chart
CREATE OR REPLACE FUNCTION get_product_relations(p_product_id UUID)
RETURNS TABLE (
  relation_type TEXT,
  record_count INTEGER,
  sample_references TEXT[]
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  
  -- Sales
  SELECT 
    'Sales'::TEXT as relation_type,
    COUNT(DISTINCT si.sale_id)::INTEGER as record_count,
    ARRAY_AGG(DISTINCT s.sale_number ORDER BY s.sale_number DESC)[:5] as sample_references
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  WHERE si.product_id = p_product_id AND s.deleted_at IS NULL
  HAVING COUNT(*) > 0
  
  UNION ALL
  
  -- Purchases
  SELECT 
    'Purchases'::TEXT,
    COUNT(DISTINCT pi.bill_id)::INTEGER,
    ARRAY_AGG(DISTINCT pb.software_bill_no ORDER BY pb.software_bill_no DESC)[:5]
  FROM purchase_items pi
  JOIN purchase_bills pb ON pb.id = pi.bill_id
  WHERE pi.product_id = p_product_id AND pb.deleted_at IS NULL
  HAVING COUNT(*) > 0
  
  UNION ALL
  
  -- Sale Returns
  SELECT 
    'Sale Returns'::TEXT,
    COUNT(DISTINCT sri.return_id)::INTEGER,
    ARRAY_AGG(DISTINCT sr.return_number ORDER BY sr.return_number DESC)[:5]
  FROM sale_return_items sri
  JOIN sale_returns sr ON sr.id = sri.return_id
  WHERE sri.product_id = p_product_id AND sr.deleted_at IS NULL
  HAVING COUNT(*) > 0
  
  UNION ALL
  
  -- Purchase Returns
  SELECT 
    'Purchase Returns'::TEXT,
    COUNT(DISTINCT pri.return_id)::INTEGER,
    ARRAY_AGG(DISTINCT pr.return_number ORDER BY pr.return_number DESC)[:5]
  FROM purchase_return_items pri
  JOIN purchase_returns pr ON pr.id = pri.return_id
  WHERE pri.product_id = p_product_id AND pr.deleted_at IS NULL
  HAVING COUNT(*) > 0
  
  UNION ALL
  
  -- Quotations
  SELECT 
    'Quotations'::TEXT,
    COUNT(DISTINCT qi.quotation_id)::INTEGER,
    ARRAY_AGG(DISTINCT q.quotation_number ORDER BY q.quotation_number DESC)[:5]
  FROM quotation_items qi
  JOIN quotations q ON q.id = qi.quotation_id
  WHERE qi.product_id = p_product_id AND q.deleted_at IS NULL
  HAVING COUNT(*) > 0
  
  UNION ALL
  
  -- Sale Orders
  SELECT 
    'Sale Orders'::TEXT,
    COUNT(DISTINCT soi.order_id)::INTEGER,
    ARRAY_AGG(DISTINCT so.order_number ORDER BY so.order_number DESC)[:5]
  FROM sale_order_items soi
  JOIN sale_orders so ON so.id = soi.order_id
  WHERE soi.product_id = p_product_id AND so.deleted_at IS NULL
  HAVING COUNT(*) > 0
  
  UNION ALL
  
  -- Delivery Challans
  SELECT 
    'Delivery Challans'::TEXT,
    COUNT(DISTINCT dci.challan_id)::INTEGER,
    ARRAY_AGG(DISTINCT dc.challan_number ORDER BY dc.challan_number DESC)[:5]
  FROM delivery_challan_items dci
  JOIN delivery_challans dc ON dc.id = dci.challan_id
  WHERE dci.product_id = p_product_id AND dc.deleted_at IS NULL
  HAVING COUNT(*) > 0;
END;
$$;
```

### ProductDashboard.tsx Changes

1. Add new state for relation details dialog:
```typescript
const [relationDialog, setRelationDialog] = useState<{
  open: boolean;
  productName: string;
  relations: Array<{ type: string; count: number; samples: string[] }>;
}>({ open: false, productName: "", relations: [] });
```

2. Update `handleBulkDelete` to show detailed dialog when blocked

3. Add new AlertDialog component showing:
   - "You cannot delete this product" title
   - Product name
   - Table of transaction types with counts
   - Sample reference numbers
   - "Mark as Inactive" button as alternative

### useProductProtection.tsx Changes

Add new function:
```typescript
const getProductRelationDetails = async (productId: string): Promise<{
  hasTransactions: boolean;
  relations: Array<{ type: string; count: number; samples: string[] }>;
}> => {
  const { data, error } = await supabase.rpc("get_product_relations", {
    p_product_id: productId,
  });
  
  // Process and return results
};
```

---

## User Experience

When user tries to delete a product with transactions:

```text
┌──────────────────────────────────────────────────────────────┐
│  ⚠️  You Cannot Delete This Product                         │
│                                                              │
│  "MANGO SHRIKAND 250" has been used in transactions:        │
│                                                              │
│  ┌─────────────────────┬───────┬────────────────────────┐   │
│  │ Transaction Type    │ Count │ References             │   │
│  ├─────────────────────┼───────┼────────────────────────┤   │
│  │ Sales               │   8   │ INV-001, INV-002, ...  │   │
│  │ Purchases           │   2   │ PUR-001, PUR-002       │   │
│  │ Sale Returns        │   1   │ SR-001                 │   │
│  └─────────────────────┴───────┴────────────────────────┘   │
│                                                              │
│  To hide this product from active use, mark it as Inactive  │
│  instead. This preserves all historical records.            │
│                                                              │
│        [Mark as Inactive]              [Close]              │
└──────────────────────────────────────────────────────────────┘
```

---

## Summary

| Component | Action |
|-----------|--------|
| Database | Create `get_product_relations()` function |
| useProductProtection.tsx | Add `getProductRelationDetails()` function |
| ProductDashboard.tsx | Add detailed relation dialog UI |
| RecycleBin.tsx | Already protected (no changes needed) |

This ensures products with sales or any other transaction history cannot be deleted (soft or hard), with clear messaging showing exactly why.

