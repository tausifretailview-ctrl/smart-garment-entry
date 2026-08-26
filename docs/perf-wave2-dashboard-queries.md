# Performance Wave 2 — dashboard queries & report guards

**Goal:** Cut duplicate full-range DB scans on Sales/POS dashboards and prevent report timeouts as org count grows.

## Changes

### Sales Invoice Dashboard

- KPI tiles (`fetchInvoiceDashboardStats`) return **RPC stats immediately** — no longer block on `fetchInvoiceDashboardReconciledPendingAmount`.
- **Background query** refines `pendingAmount` from receipt reconcile when invoices exist.
- Statement timeout → user-friendly toast on list load failure.

### POS Dashboard

- Summary KPIs use RPC with **`correctModeTotals: false`** for fast first paint.
- When cash+card+upi sum exceeds net sale (mix over-tender), **background query** runs mode-total correction scan.
- Statement timeout toast on list load failure.

### Item-wise Sales Report

- **“All time”** period → rolling **12 months** (was year 2000 → today — full org scan).
- Custom ranges **> 366 days** blocked with warning toast (query not run).

## Cloud impact

- **Large reduction** in duplicate sales scans on dashboard open (especially monthly filter on busy orgs).
- Item-wise “All” no longer reads entire sales history.

## Verify (demo + one busy org)

1. Sales Invoice Dashboard — KPI tiles appear before table finishes reconciling; Pending may tick once background refine completes.
2. POS Dashboard — summary strip loads without long skeleton; expand row still loads line items on demand.
3. Item-wise Sales → period **All** — loads last 12 months only; custom 2-year range shows warning.

## Next (Wave 3 — optional)

- Payments Dashboard server pagination RPC
- Stock report / Tally export date guards
- Supabase **Medium** upgrade if CPU still high after deploy + 1 week metrics
