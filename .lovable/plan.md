

## Fix: Reconciliation RPC Miscounting Sale Return Edits

### Problem
The `reset_stock_from_transactions` (or `fix_stock_discrepancies`) RPC incorrectly calculated expected stock for variant `150006861`. It applied a -2 reconciliation adjustment when it should have applied 0 or left it alone. The root cause is that the sale return edit flow creates delete + re-insert movements, and the RPC likely counts from `sale_return_items` without properly filtering duplicates from the edit cycle.

### Immediate Fix (Data Correction)
1. **Update stock_qty** for variant `0f02cece-0b6a-489a-8c6d-da309d84c219` from 0 to 1 via migration or insert tool
2. **Log a corrective stock_movement** entry of +1 (type: reconciliation)

### RPC Audit (Prevent Recurrence)
3. **Review `reset_stock_from_transactions` RPC** — verify it queries `sale_return_items` joined to `sale_returns` with `deleted_at IS NULL` on BOTH tables to avoid counting items from deleted/re-created returns during edits
4. **Review `detect_stock_discrepancies` RPC** — same check: ensure the calculated qty formula only counts active (non-deleted) transaction items
5. **Review `fix_stock_discrepancies` RPC** — ensure the movement it logs uses the corrected calculation

### Technical Details
- Variant ID: `0f02cece-0b6a-489a-8c6d-da309d84c219`
- Organization: `dafc3d0c-874e-4784-bac3-5eab5f3c85b5`
- Correct formula: `opening(0) + purchases(1) - sales(1) + sale_returns(1) - pur_returns(0) = 1`
- Current stock_qty: 0 (wrong)
- Will inspect all three RPCs (`detect_stock_discrepancies`, `fix_stock_discrepancies`, `reset_stock_from_transactions`) to find and fix the filtering gap

