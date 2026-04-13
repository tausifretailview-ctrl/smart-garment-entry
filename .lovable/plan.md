

## Plan: Add Stock Ceiling Validation — Stock Cannot Exceed Total Purchased

### Problem
Stock can drift above the total purchased quantity through sale return creation, sale return deletion bugs, or manual stock imports. A ceiling guard is needed at both the database trigger level and the frontend.

### Important: Schema Corrections
The Gemini prompt references tables that **don't exist** in your database. Here's the mapping:
- `purchase_bill_items` → your table is **`purchase_items`**
- `stock_transactions` → your table is **`stock_movements`** (and it has no `credit_qty` column)
- `org_id` on purchase_items → the org is on `purchase_bills.organization_id`, not directly on `purchase_items`

### Changes

**1. Create `src/utils/stockCeilingValidation.ts` — Frontend guard function**
- `validateStockCeiling(supabase, variantId, qtyToAdd, operation)` 
- Queries `purchase_items` (joined via `purchase_bills` for org filtering) to get total purchased qty for the variant
- Queries `purchase_return_items` to get total returned qty
- Compares: `current_stock + qtyToAdd` must not exceed `total_purchased - total_purchase_returned`
- Returns `{ valid, reason }` with a clear error message

**2. Database trigger — Strongest protection layer (Migration)**
- Create function `check_stock_ceiling_on_return()` that runs BEFORE INSERT on `sale_return_items`
- Calculates total purchased for the variant from `purchase_items` (via `sku_id`)
- Calculates total purchase-returned from `purchase_return_items` (via `sku_id`)
- Gets current `stock_qty` from `product_variants`
- If `current_stock + NEW.quantity > total_purchased - total_purchase_returned`, raises an exception
- This blocks stock inflation regardless of frontend bugs

**3. Apply frontend guard in Sale Return creation — `SaleReturnEntry.tsx`**
- Before saving new sale return items, call `validateStockCeiling` for each item
- Show toast error and block save if ceiling would be exceeded

**4. Apply frontend guard in Sale Return delete — `useSoftDelete.tsx`**
- The delete trigger already correctly deducts stock (no ceiling check needed for deductions)
- No change needed here — the DB trigger on INSERT is the key guard

**5. Apply frontend guard in Stock Import — `StockImportTab.tsx`**
- Before applying imported stock quantities, validate each row against the ceiling
- Skip rows that would exceed the ceiling and show a warning summary

### What This Does NOT Do
- Does not add a `stock_transactions` table (doesn't exist in your schema)
- Does not run bulk audit/fix queries (that would be a separate data operation if needed)
- The DB trigger is the strongest layer — even if frontend is bypassed, stock cannot exceed purchases

### Files
| File | Action |
|---|---|
| `src/utils/stockCeilingValidation.ts` | Create — ceiling check utility |
| `supabase/migrations/...` | Create — DB trigger `check_stock_ceiling_on_return` |
| `src/pages/SaleReturnEntry.tsx` | Edit — add ceiling check before save |
| `src/components/StockImportTab.tsx` | Edit — add ceiling check during import |

