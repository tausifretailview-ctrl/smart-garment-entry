

# Stock Update Plan for SM Hair Replacement

## Overview
Update stock quantities for **PBARIA LOS ANGELES** and **AUSTRIALIAN** products in the SM Hair Replacement organization database.

---

## Products to Update

### 1. PBARIA LOS ANGELES (7 variants)

| Size | Barcode | Current Stock | → New Stock |
|------|---------|:-------------:|:-----------:|
| 7x5 | 30001051 | 6 | 3 |
| 8x5 | 30001128 | 2 | 1 |
| 8x6 | 30001052 | 26 | 27 |
| 9x6 | 30001053 | 49 | 25 |
| 9x7 | 30001054 | 41 | 19 |
| 10x7 | 30001055 | 7 | 3 |
| 10x8 | 30001056 | 6 | 3 |

### 2. AUSTRIALIAN (5 variants)

| Size | Barcode | Current Stock | → New Stock | Status |
|------|---------|:-------------:|:-----------:|--------|
| 7x5 | 1110205 | 19 | 4 | Active |
| 8x6 | 10025 | 19 | 9 | Active |
| 9x6 | 10026 | 20 | 7 | Active |
| 9x7 | 10027 | - | 6 | ⚠️ DELETED |
| 10x7 | 10028 | 24 | 7 | Active |

---

## Issue: Austrialian-9x7 is Soft-Deleted

The **Austrialian-9x7** product (barcode 10027) is currently in the Recycle Bin and cannot have its stock updated until it's restored.

---

## Implementation Steps

### Step 1: Restore Austrialian-9x7 from Recycle Bin
- Clear the `deleted_at` field on the product and its variant
- This will make it visible in Stock Report and dashboards again

### Step 2: Update Stock Quantities
Execute direct `UPDATE` statements on the `product_variants` table for each variant:

```text
PBARIA LOS ANGELES:
- 7x5 (30001051): 6 → 3
- 8x5 (30001128): 2 → 1
- 8x6 (30001052): 26 → 27
- 9x6 (30001053): 49 → 25
- 9x7 (30001054): 41 → 19
- 10x7 (30001055): 7 → 3
- 10x8 (30001056): 6 → 3

AUSTRIALIAN:
- 7x5 (1110205): 19 → 4
- 8x6 (10025): 19 → 9
- 9x6 (10026): 20 → 7
- 9x7 (10027): → 6 (after restore)
- 10x7 (10028): 24 → 7
```

### Step 3: Create Stock Movement Audit Records
Insert records into `stock_movements` table with `movement_type = 'manual_adjustment'` for each change to maintain audit trail.

---

## Technical Details

**Database Operations:**
1. Use the insert/update tool to execute `UPDATE product_variants SET stock_qty = X WHERE id = 'variant-id'`
2. Create corresponding `stock_movements` records for audit purposes
3. Restore the deleted Austrialian-9x7 product first

**Total Updates:** 12 product variants

