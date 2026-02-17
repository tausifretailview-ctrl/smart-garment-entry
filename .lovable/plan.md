

## Point-in-Time Inventory: `balance_after` on Stock Movements

### Concept

Add a `balance_after` column to `stock_movements` so every row records the resulting stock level after that movement. This enables instant historical queries like "What was stock for item X on Friday at 4 PM?" without recalculating from the beginning.

### Why This Is Not Straightforward

Before recommending implementation, here are the real engineering challenges:

**Problem 1: FIFO Creates Multiple Rows Per Transaction**

A single sale can create up to **14 movement rows** for the same variant (one per batch deducted). The current triggers insert these movement rows inside a loop BEFORE the final `stock_qty` UPDATE happens. So during insertion, the "correct" balance_after isn't yet committed.

Example: Variant has stock=50. Sale of 10 units deducts from 3 batches:
- Row 1: -4 from batch A (balance_after should be 46)
- Row 2: -3 from batch B (balance_after should be 43)  
- Row 3: -3 from batch C (balance_after should be 40)

Each row needs a different value, and all are inserted before the `UPDATE product_variants SET stock_qty = stock_qty - 10` executes.

**Problem 2: Concurrent Transactions Race**

If two sales for the same variant happen simultaneously, both triggers read `stock_qty = 50` at the start. Both would calculate `balance_after` based on 50, producing incorrect values. Currently 1,432 timestamp collisions exist in the data, confirming this happens in practice.

**Problem 3: Reconciliation Invalidates History**

When `fix_stock_discrepancies()` corrects `stock_qty`, all previous `balance_after` values become retroactively wrong. You'd need to rewrite history or accept that `balance_after` is only accurate going forward.

**Problem 4: Massive Trigger Surface Change**

All 12 stock-affecting trigger functions would need modification. Each has different INSERT patterns (loop-based for FIFO, single for simple operations). This is a high-risk change across ~500 lines of trigger SQL.

---

### Recommended Approach: Computed, Not Stored

Instead of modifying all 12 triggers, create a **database function** that calculates point-in-time stock on demand:

```sql
CREATE FUNCTION get_stock_at_time(
  p_variant_id UUID, 
  p_timestamp TIMESTAMPTZ
) RETURNS INTEGER
```

This function would:
1. Start from `product_variants.opening_qty`
2. Sum all `stock_movements.quantity` for that variant where `created_at <= p_timestamp`
3. Exclude `movement_type = 'reconciliation'`
4. Return the result

**Why this works better:**
- Zero trigger changes (no risk to existing stock logic)
- Always accurate (computed from source of truth)
- Works retroactively on all 55,000 existing movements
- No race condition issues
- No reconciliation invalidation

**Performance:** With the existing `idx_stock_movements_org_date` index, this query scans a small subset of movements per variant. Average ~7 movements per variant currently (55K / 8.2K variants).

---

### Implementation Plan

**Step 1 -- Database function (migration)**

Create `get_stock_at_time(p_variant_id, p_timestamp)` that returns the computed stock level at any point in time. Also create `get_stock_at_time_batch(p_variant_ids UUID[], p_timestamp)` for bulk queries.

**Step 2 -- Add index for per-variant time queries**

```sql
CREATE INDEX idx_stock_movements_variant_time 
ON stock_movements(variant_id, created_at);
```

**Step 3 -- Stock History Ledger View (optional UI enhancement)**

A new component or report page that shows a variant's full movement history with running balance, computed at query time using a window function:

```sql
SELECT *, 
  opening_qty + SUM(quantity) OVER (
    ORDER BY created_at 
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) as balance_after
FROM stock_movements 
WHERE variant_id = ? 
ORDER BY created_at;
```

This gives the exact `balance_after` for every row without storing it, with perfect accuracy.

---

### What We Will NOT Do

- Will not modify any of the 12 stock trigger functions
- Will not add a stored `balance_after` column (risk outweighs benefit at current scale)
- Will not change any existing stock logic
- Will not backfill historical data (the computed approach works retroactively)

### Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/` | New function `get_stock_at_time()` + index |
| No application files | Function is available for future report pages |

### When to Revisit Stored `balance_after`

If query volume for point-in-time lookups becomes high (hundreds per minute) AND per-variant movement counts exceed 1,000+ rows, then adding a stored column with careful trigger ordering becomes worthwhile. At current scale (avg 7 movements/variant), computation is instant.

