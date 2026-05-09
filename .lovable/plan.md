# Why some Ella Noor invoices show 0 QTY with no items

## Investigation (live data)

Sample invoice from the screenshot — **INV/26-27/244 (Nushina Mohid)**:

| Field | Value |
|---|---|
| `is_cancelled` | **true** |
| `cancelled_at` | 2026-04-19 |
| `payment_status` | `pending` (stale — should be `cancelled`) |
| `total_qty` | 0 |
| `sale_items` rows in DB | **0** (hard-deleted) |
| `net_amount` | ₹3,200 |

A scan of the whole organisation finds **67 sales rows in the same state** (totalling ₹4,27,700). All 67 have `is_cancelled = true`. Of those, **51 correctly carry `payment_status = 'cancelled'`, but 16 still carry `payment_status = 'pending'`** — those are the ones that look like real unpaid bills on the dashboard.

## Root cause

1. **Items disappear because the bill was cancelled.** The `cancel_invoice` RPC (`supabase/migrations/20260314043106_*.sql`, line 46) does `DELETE FROM sale_items WHERE sale_id = …` and only flips `is_cancelled = true` on the parent. That is by design — it reverses stock via the `handle_sale_item_delete` trigger. So a cancelled invoice will always have `total_qty = 0` and an empty Items section. The yellow banner "No line items loaded for this invoice" is therefore correct.

2. **The desktop dashboard row does not show a Cancelled badge.** In `src/pages/SalesInvoiceDashboard.tsx` the desktop table (lines 3424-3435) builds the Pay Status badge purely from `invoice.payment_status` (`completed` / `partial` / else `Not Paid`) and ignores `is_cancelled`. The mobile card (lines 2754-2784) already does the right thing — strikes through the row, dims it, and shows a red "Cancelled" pill. The desktop row is the one painting "Not Paid" + ₹3,200 balance for cancelled bills.

3. **16 invoices have a stale `payment_status = 'pending'`.** Today's `cancel_invoice` sets `payment_status = 'cancelled'`, but earlier versions of the RPC (and/or the periodic "normalize paid_amount/payment_status" pass at line 578) left these 16 rows with the old `pending` value. Combined with #2, those rows visually contribute ₹ to the Outstanding column — which is what alarmed the user.

## Solution

### 1. Data backfill (one-off migration)
For every sale where `is_cancelled = true` but `payment_status <> 'cancelled'`, set `payment_status = 'cancelled'` (org-scoped, soft-delete-safe). This is a pure correction — no balances move because the dashboard KPI code already excludes `is_cancelled` rows.

```sql
UPDATE public.sales
   SET payment_status = 'cancelled',
       updated_at     = now()
 WHERE is_cancelled = true
   AND COALESCE(payment_status, '') <> 'cancelled'
   AND deleted_at IS NULL;
```

### 2. Dashboard row fix (`src/pages/SalesInvoiceDashboard.tsx`, desktop table)
Mirror the mobile-card treatment for cancelled invoices:
- Render a red **"Cancelled"** badge in the Pay Status column when `invoice.is_cancelled === true`, taking precedence over `payment_status`.
- Apply `line-through` + muted opacity to Invoice No., Customer, Amount, and Balance cells (same classes already used at lines 2759/2769/2784).
- Force the Balance column to show `₹0` for cancelled rows (already excluded from KPI math; just make the row consistent).
- Disable the Edit / Print / Pay actions for cancelled rows (Delete is already disabled at line 361).

### 3. Items-section banner (`src/pages/SalesInvoiceDashboard.tsx`, expanded view)
When `invoice.is_cancelled` is true, replace the current "No line items loaded for this invoice (inactive or never saved)…" warning with an informational note: *"Invoice cancelled on {cancelled_at}. Items and stock have been reversed."* This stops users from trying to "open Sales Invoice and re-enter products" — that action is not valid for a cancelled bill.

### 4. (Optional) Default dashboard filter
Add a "Hide Cancelled" toggle (default ON) to the existing filter bar so cancelled bills only appear when explicitly requested or when filtering by the Cancelled status. Recycle Bin already lists them via `is_cancelled.eq.true`.

## Out of scope
- No change to `cancel_invoice` RPC, stock-reversal trigger, or the main paginated query.
- No attempt to "restore" the deleted line items — they are gone by design and the stock has already been reversed.

## Files touched
- `supabase/migrations/<new>_backfill_cancelled_payment_status.sql` (data fix)
- `src/pages/SalesInvoiceDashboard.tsx` (desktop row badge + disabled actions + items-section banner; optional filter toggle)
