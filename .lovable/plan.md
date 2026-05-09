## Fix: Sales Invoice Dashboard QTY column shows 0

**File:** `src/pages/SalesInvoiceDashboard.tsx` (line 3392)

**Change:** Replace the `sale_items.reduce(...)` computation (which is always undefined in the paginated query) with the already-fetched `total_qty` field.

```diff
- {invoice.sale_items?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0}
+ {invoice.total_qty || 0}
```

No other changes — query, columns, and logic untouched.