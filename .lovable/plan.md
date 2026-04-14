

## Stock Reconciliation Audit — Findings & Fix Plan

### Current State
- **86 total discrepancies** found across 15 organizations
- **43 are service products** — these are **false positives** (services don't track stock; triggers keep them at 0, but the formula calculates negative values from sales)
- **43 are goods** — most are items sold without purchase history (stock is 0 but formula says it should be negative; the `stock_not_negative` DB constraint prevents this)
- The reconciliation formula itself is correct: `opening + purchases - sales - purchase_returns + sale_returns - pending_challans`

### Issues Found

**1. Service products not excluded from scan (false positives)**
The `detect_stock_discrepancies` SQL function does not filter `p.product_type != 'service'`. This causes ~50% of reported discrepancies to be noise — services like "HAIR CUT", "SHAVING" etc. that correctly sit at 0 stock.

The `reconcile_variant_stock_qty` single-variant function also lacks this filter.

**2. "Reset Stock from Bills" would set goods to negative (blocked by constraint)**
For goods items sold without purchase records (e.g., items that existed before the system), the calculated stock is negative. Running "Fix" or "Reset" would attempt to set `stock_qty` to a negative number, which the `stock_not_negative` constraint blocks — causing a silent failure.

**3. Cancelled sales already handled correctly**
The `cancel_invoice` RPC hard-deletes `sale_items`, so they don't appear in the formula. No issue here.

### Fix Plan

**Migration — Update all 3 SQL functions to exclude services and combos:**

1. `detect_stock_discrepancies` — Add `AND p.product_type NOT IN ('service', 'combo')` to the WHERE clause
2. `fix_stock_discrepancies` — Already calls `detect_stock_discrepancies`, so it inherits the filter automatically
3. `reset_stock_from_transactions` — Add the same product_type filter
4. `reconcile_variant_stock_qty` — Add product_type check and return early for service/combo

**Frontend — Minor UI improvements in StockReconciliation.tsx:**

5. Show product type in the discrepancy table so users can identify item types
6. Add a note clarifying that service products are excluded from stock tracking

### Impact
- Eliminates ~50% of false-positive discrepancies immediately
- Prevents failed reconciliation attempts on constrained items
- No risk to existing stock data — these are read/filter changes only

