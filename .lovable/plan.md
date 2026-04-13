

## Plan: Include Opening Stock in Stock Ceiling Validation

### Problem
The current stock ceiling formula is:
```
max_allowed = total_purchased - total_purchase_returned
```

This ignores **opening stock** (`product_variants.opening_qty`) that was entered at product creation time. Products with opening stock but few/no purchases will incorrectly fail the ceiling check.

### Fix
Update the formula everywhere to:
```
max_allowed = opening_qty + total_purchased - total_purchase_returned
```

### Changes

**1. Frontend — `src/utils/stockCeilingValidation.ts`**
- Already fetches variant data on line 28-32; add `opening_qty` to the select
- Update line 73: `maxAllowed = openingQty + totalPurchased - totalPurchaseReturned`
- Update error message to include opening qty

**2. Database Trigger — Migration**
- Update `check_stock_ceiling_on_sale_return()` function
- Add `v_opening_qty` variable, fetch from `product_variants.opening_qty`
- Update formula: `v_max_allowed := v_opening_qty + v_total_purchased - v_total_returned`

### Files
| File | Action |
|---|---|
| `src/utils/stockCeilingValidation.ts` | Edit — add opening_qty to ceiling formula |
| `supabase/migrations/...` | Create — update trigger function |

