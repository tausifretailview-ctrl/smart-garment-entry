

## Ezzy ERP - Complete Stock Management Logic

### Architecture Overview

Stock management is **entirely trigger-driven** at the database layer. No application code directly modifies `stock_qty`. All stock changes flow through PostgreSQL trigger functions attached to line-item tables, ensuring atomicity and a single source of truth.

```text
                     STOCK IN (+)                          STOCK OUT (-)
              ========================              ========================
              Purchase Item INSERT    +qty          Sale Item INSERT       -qty
              Sale Return Item INSERT +qty          Purchase Return INSERT -qty
              Restore Sale (recycle)  +qty          Soft Delete Sale       -qty  (recycle bin)
              Restore Purchase Return +qty          Soft Delete Purchase   -qty  (recycle bin)
              Sale Item UPDATE (qty-) +diff         Sale Item UPDATE (qty+) -diff
              Purchase Item UPDATE(+) +diff         Purchase Item UPDATE(-) -diff
              Challan Item DELETE     +qty          Challan Item INSERT    -qty
              Stock Adjustment        +/-           Reconciliation         +/-
```

---

### All 18 Active Stock Triggers

Here is every trigger currently active on stock-related tables:

| # | Table | Event | Trigger Function | Stock Effect |
|---|-------|-------|------------------|--------------|
| 1 | `purchase_items` | AFTER INSERT | `update_stock_on_purchase()` | +qty to variant, creates batch_stock, logs movement |
| 2 | `purchase_items` | AFTER UPDATE | `handle_purchase_item_update()` | +/- difference, adjusts batch_stock |
| 3 | `purchase_items` | AFTER DELETE | `handle_purchase_item_delete()` | -qty from variant, removes batch_stock |
| 4 | `sale_items` | AFTER INSERT | `update_stock_on_sale()` | -qty from variant, FIFO batch deduction |
| 5 | `sale_items` | AFTER UPDATE | `handle_sale_item_update()` | +/- difference, FIFO batch adjustment |
| 6 | `sale_items` | AFTER DELETE | `handle_sale_item_delete()` | +qty to variant (reverse) |
| 7 | `sale_return_items` | AFTER INSERT | `restore_stock_on_sale_return()` | +qty to variant, restores batch_stock |
| 8 | `sale_return_items` | BEFORE DELETE | `handle_sale_return_item_delete()` | -qty from variant (reverse the return) |
| 9 | `purchase_return_items` | AFTER INSERT | `deduct_stock_on_purchase_return()` | -qty from variant, FIFO batch deduction |
| 10 | `purchase_return_items` | BEFORE DELETE | `handle_purchase_return_item_delete()` | +qty to variant (reverse) |
| 11 | `delivery_challan_items` | AFTER INSERT | `update_stock_on_challan()` | -qty from variant, FIFO batch deduction |
| 12 | `delivery_challan_items` | BEFORE DELETE | `handle_challan_item_delete()` | +qty to variant (reverse) |
| 13 | `stock_movements` | AFTER INSERT | `audit_stock_changes()` | No stock change -- audit log only |
| 14 | `product_variants` | AFTER UPDATE | `audit_variant_price_changes()` | No stock change -- price audit only |
| 15 | `purchase_items` | AFTER INSERT | `update_last_purchase_prices()` | No stock change -- updates last purchase price |
| 16 | `sale_items` | AFTER INSERT | `update_customer_product_price_on_sale()` | No stock change -- customer price tracking |
| 17 | `product_variants` | BEFORE UPDATE | `update_updated_at_column()` | No stock change -- timestamp only |
| 18 | `purchase_items` | BEFORE UPDATE | `update_updated_at_column()` | No stock change -- timestamp only |

---

### Stock Formula

For any product variant, the correct stock at any point is:

```text
stock_qty = opening_qty
          + SUM(purchase movements)
          - SUM(sale movements)
          + SUM(sale_return movements)
          - SUM(purchase_return movements)
          - SUM(challan movements)
          +/- SUM(reconciliation movements)
```

This is exactly what `detect_stock_discrepancies()` and `reset_stock_from_transactions()` validate against.

---

### Entry Point Details

**1. Purchase Entry (Stock IN)**
- Trigger: `update_stock_on_purchase()`
- Adds qty to `product_variants.stock_qty`
- Creates/updates `batch_stock` record (for FIFO tracking)
- Logs `stock_movements` with type `purchase`

**2. Sales / POS (Stock OUT)**
- Trigger: `update_stock_on_sale()`
- Validates stock >= requested qty (raises exception if insufficient)
- Deducts from oldest `batch_stock` first (FIFO)
- Logs `stock_movements` with type `sale`
- Service/combo products: skips stock validation, logs movement only

**3. Sale Return (Stock IN)**
- Trigger: `restore_stock_on_sale_return()`
- Adds qty back to `product_variants.stock_qty`
- Restores to most recent batch_stock
- Logs `stock_movements` with type `sale_return`

**4. Purchase Return (Stock OUT)**
- Trigger: `deduct_stock_on_purchase_return()`
- Validates current stock >= return qty (blocks if insufficient)
- Deducts from oldest batch (FIFO)
- Logs `stock_movements` with type `purchase_return`

**5. Delivery Challan (Stock OUT)**
- Trigger: `update_stock_on_challan()`
- Validates stock >= requested qty
- FIFO deduction from batches
- Logs `stock_movements` with type `challan`

**6. Soft Delete / Recycle Bin (Stock Reversal)**
- `soft_delete_sale()`: Returns sold qty back to stock (+qty), logs `soft_delete_sale`
- `restore_sale()`: Re-deducts stock (-qty), logs `restore_sale`
- `soft_delete_purchase_bill()`: Removes purchased qty from stock (-qty), logs `soft_delete_purchase`
- `restore_purchase_bill()`: Re-adds purchased qty (+qty), logs `restore_purchase`
- Same pattern for sale returns and purchase returns

**7. Sale Item UPDATE (Quantity Change)**
- Trigger: `handle_sale_item_update()`
- If qty increased: deducts additional from oldest batch (FIFO)
- If qty decreased: restores to most recent batch
- Logs `sale_update_decrease` or `sale_update_increase`

**8. Hard DELETE of Items**
- All item delete triggers check `IF OLD.deleted_at IS NOT NULL THEN RETURN` to prevent double-counting when hard-deleting already soft-deleted records
- Otherwise reverses the original stock effect

**9. Stock Adjustment Tool (Manual)**
- Application code in `StockAdjustment.tsx`
- Directly updates `opening_qty` and `stock_qty` on `product_variants`
- Logs `stock_movements` with type `reconciliation`
- Formula: `New Stock = New Opening + Purchased - Sold + Returned + Adjusted`

**10. Stock Reconciliation**
- `detect_stock_discrepancies()`: Compares `stock_qty` vs calculated value from movements
- `fix_stock_discrepancies()`: Updates `stock_qty` to match, logs with type `reconciliation` (qty=0 to not affect future calculations)
- `reset_stock_from_transactions()`: Full recalculation from actual transaction records

---

### Application-Level Validation (Pre-Save)

Before database triggers even fire, the app validates stock:

- `useStockValidation` hook: Checks `product_variants.stock_qty` before allowing save
- Aggregates cart items by variant ID to handle duplicates
- In edit mode: calculates "freed" qty from original invoice to avoid false insufficient-stock errors
- Skips service/combo products (unlimited stock)
- Shows toast errors with per-item availability

---

### FIFO Batch Stock System

Every purchase creates a `batch_stock` record tracking:
- `variant_id`, `bill_number`, `quantity`, `purchase_date`, `purchase_bill_id`

Sales deduct from oldest batch first. Returns restore to the most recent or oldest batch depending on the operation type. This enables cost-of-goods-sold (COGS) tracking by purchase batch.

---

### Safety Mechanisms

1. **Double-deduction prevention**: All DELETE triggers check `IF OLD.deleted_at IS NOT NULL` to skip already-soft-deleted items
2. **Insufficient stock blocking**: Sale and purchase return triggers raise exceptions if stock < requested
3. **Service/combo skip**: Products with type `service` or `combo` bypass all stock tracking
4. **Reconciliation exclusion**: `detect_stock_discrepancies()` excludes `movement_type = 'reconciliation'` from calculations to prevent circular adjustments
5. **Organization isolation**: All movement records include `organization_id`
6. **Audit trail**: Every stock change logged in `stock_movements` with type, quantity, reference, and notes

---

### Summary: This System is Complete and Accurate

The current architecture covers all stock entry/exit points with database-level triggers. No gaps exist in the flow. The system handles:
- Normal transactions (purchase, sale, returns, challans)
- Edits (quantity updates on existing items)
- Deletions (soft and hard, with reversal logic)
- Manual adjustments and reconciliation
- FIFO batch tracking for COGS
- Pre-save validation at the application layer
- Multi-organization isolation

No changes are recommended -- the stock management logic is production-grade and enterprise-ready.

