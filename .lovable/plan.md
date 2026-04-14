

## Fix Stock Accuracy Across All Organizations

### The Problem
There are **3,328+ stock discrepancies** across 20 organizations. The root cause: the `reset_stock_from_transactions` RPC formula is missing **pending delivery challans** (which deduct stock but aren't sales yet), and past reconciliation runs used the flawed `batch_stock`-based formula that drifts due to FIFO depletion.

### Current Discrepancy Counts (Top 5)
```text
Organization                          Discrepancies
4bc73037... (largest org)                     1,055
0b3a8035...                                    535
e8fbf0d8...                                    429
dafc3d0c... (Velvet)                           301
e50803d3...                                    173
```

### Plan

**Step 1 — Fix the RPC formula (migration)**
Update `reset_stock_from_transactions` and `detect_stock_discrepancies` to include pending delivery challans in the stock formula:

```
Stock = Opening + Purchases - Sales - Purchase Returns + Sale Returns - Pending Challans
```

Where "Pending Challans" = challan items where `converted_to_invoice_id IS NULL` (unconverted challans that already deducted stock).

Also update `reconcile_variant_stock_qty` to use the same transaction-based formula instead of `batch_stock`, ensuring all three RPCs agree.

**Step 2 — Run global reconciliation (data fix)**
Execute a one-time migration that runs the corrected formula across ALL organizations, updating every variant's `stock_qty` to match the authoritative transaction calculation. Each correction logged as a `reconciliation` movement for audit.

**Step 3 — Add nightly auto-reconciliation (optional enhancement)**
Add a lightweight scheduled check that runs `detect_stock_discrepancies` and auto-fixes any drift, ensuring stock stays accurate without manual intervention. This would use an edge function on a cron schedule.

### What This Achieves
- Single authoritative formula across all RPCs
- Immediate correction of all 3,328+ discrepancies
- Prevents future drift from edit flows, FIFO bugs, or missed triggers

