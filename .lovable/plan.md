## Root Cause

The bill **PUR/26-27/1** in "kids-zone" has **3,490 purchase items** (and 3,490 matching `batch_stock` rows). When the user clicks **Delete Selected**, the frontend calls the database function `soft_delete_purchase_bill`, which today processes every item inside a **row-by-row PL/pgSQL loop**, executing:

- `SELECT stock_qty` (pre-check, per item)
- `UPDATE product_variants` (per item)
- `UPDATE batch_stock` (per item)
- `DELETE FROM batch_stock` (per item)
- `INSERT INTO stock_movements` (per item)

For this bill that is ~17,000+ statements in one transaction. The RPC exceeds the PostgREST/edge timeout, the client receives an error, `softDelete` returns `false`, and the bulk handler shows the toast **"0 purchase bill(s) moved to recycle bin"** — exactly what the user sees.

Stock check is fine (verified: 0 items would go negative), so the delete is logically valid — it's purely a performance/timeout problem on very large bills (typical of opening-stock entries).

## Fix

Rewrite `public.soft_delete_purchase_bill(p_bill_id, p_user_id)` to use **set-based SQL** instead of a per-row loop. Same behaviour, same safety checks, same stock movement audit rows — just executed as a handful of bulk statements:

1. **Pre-check (single query)** — abort if any item would push stock negative:
   ```sql
   SELECT pi.product_name, pi.size, pv.stock_qty, SUM(pi.qty) AS need
   FROM purchase_items pi JOIN product_variants pv ON pv.id = pi.sku_id
   WHERE pi.bill_id = p_bill_id AND pi.deleted_at IS NULL AND pi.sku_id IS NOT NULL
   GROUP BY pi.sku_id, pi.product_name, pi.size, pv.stock_qty
   HAVING pv.stock_qty < SUM(pi.qty)
   LIMIT 1;
   ```
   If found, RAISE the same friendly exception as today.

2. **Reverse `product_variants.stock_qty`** in one statement using an aggregated subquery (sums quantities per `sku_id` so duplicate SKUs in one bill are handled correctly).

3. **Update `batch_stock`** in one statement scoped to `purchase_bill_id = p_bill_id` (subtract qty, clamp at 0).

4. **Delete zero-quantity `batch_stock`** rows in one statement.

5. **Insert `stock_movements`** audit rows via `INSERT … SELECT` from `purchase_items` (one statement creating N rows).

6. Soft-delete `purchase_items`, `voucher_entries`, and the `purchase_bills` row (unchanged — already set-based).

This will reduce ~17,000 round-trips to ~7 SQL statements, completing well within the timeout for even 10,000-item bills.

## Deliverable

- **New migration** that `CREATE OR REPLACE FUNCTION public.soft_delete_purchase_bill(...)` with the set-based implementation above. No frontend or other backend changes needed.

## Verification

After applying:
- User selects PUR/26-27/1 → Delete Selected → expect toast "1 purchase bill(s) moved to recycle bin" within ~1s.
- Stock reversal correctness: `product_variants.stock_qty` decreases by the bill's totals; corresponding `batch_stock` rows clear; matching `stock_movements` rows (type `soft_delete_purchase`) are written.
- Negative-stock guard still trips when a bill has items whose qty exceeds current stock.