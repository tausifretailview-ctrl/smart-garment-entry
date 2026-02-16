

# Composite Indexes -- Original Request with Column Name Corrections

Create all 8 indexes as originally requested, correcting only the column names that don't exist in the actual schema.

---

## Column Name Corrections

| Original Request | Corrected | Reason |
|-----------------|-----------|--------|
| `purchase_bills.purchase_date` | `purchase_bills.bill_date` | Actual column name in schema |
| `purchase_items.purchase_id` | `purchase_items.bill_id` | Actual column name in schema |

---

## Migration SQL

```sql
-- 1. SALES TABLE INDEXES
CREATE INDEX IF NOT EXISTS idx_sales_org_date
ON sales (organization_id, sale_date);

CREATE INDEX IF NOT EXISTS idx_sales_org_id
ON sales (organization_id, id);

-- 2. SALE_ITEMS TABLE INDEXES
CREATE INDEX IF NOT EXISTS idx_sale_items_saleid_org
ON sale_items (sale_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_org
ON sale_items (organization_id);

-- 3. PURCHASE_BILLS TABLE INDEXES
CREATE INDEX IF NOT EXISTS idx_purchase_org_date
ON purchase_bills (organization_id, bill_date);

CREATE INDEX IF NOT EXISTS idx_purchase_org_id
ON purchase_bills (organization_id, id);

-- 4. PURCHASE_ITEMS TABLE INDEXES
CREATE INDEX IF NOT EXISTS idx_purchase_items_billid_org
ON purchase_items (bill_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_purchase_items_org
ON purchase_items (organization_id);
```

All indexes use `IF NOT EXISTS` so any that already exist will be safely skipped. No tables, columns, or existing indexes are modified or dropped.

---

## Files Changed

| File | Change |
|------|--------|
| New migration SQL | 8 composite indexes created |

