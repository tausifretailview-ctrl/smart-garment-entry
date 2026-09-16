# Stop empty (0 qty) bills from being saved

## What is happening

When a bill is saved, the bill header is written first and the products are written a moment later. If that second step fails, the bill stays in the system with no products: quantity 0, money counted, no stock movement. That is exactly what happened in Trendzo on 16 Sep (7 bills of Rs 2,500 each, already cancelled).

There is already a safety net that removes an empty bill when the products fail — but it deliberately refuses to act as soon as the bill is marked paid. Every one of these bills is marked paid, so the safety net never fires and the empty bill survives.

## What will change

1. **Block the empty bill at billing time (all shops).** If the products cannot be saved, the bill is removed instead of kept, even when it is already marked paid — a paid bill with zero products is never legitimate. The cashier sees a clear "Bill not saved — please ring it again" message rather than a "Sale was saved" message.
2. **Clean up the existing empty bills.** Cancel the bills that currently have no products at all, so they drop out of sales, quantity and cash figures.

Held bills (parked carts, nothing charged) are left alone — an empty parked cart is normal.

## Existing empty bills to be cancelled

| Status | Count | Value |
|---|---|---|
| Paid POS bills | 51 | Rs 2,02,537 |
| Unpaid POS bills | 13 | Rs 20,627 |
| Paid invoices | 2 | Rs 5,619 |
| Parked/held carts | 17 | left untouched |

Spread across SM Hair Replacement (27), Tirtha Cosmetics (24), Your Choice Gift & Toys (7), Mulund Mobility (6), Demo (5) and ten other shops. Each one is cancelled with a reason recorded, not deleted, so it stays visible in the recycle-bin/audit trail.

## Technical detail

- `decidePosSaveAutoRollback` (`src/utils/posSaleDeleteGuard.ts`): the `completed`/`partial` early return currently wins over `itemCount === 0`. Change so that `itemCount === 0` always yields `rollback_empty_header` regardless of payment status; keep `itemCount > 0` as `keep_sale` (unchanged). The existing test "keeps a settled sale even with zero counted items" in the guard's test file is inverted to match, and a `partial` + 0 items case added.
- `src/hooks/useSaveSale.tsx` catch block: when the decision is `rollback_empty_header`, surface a destructive toast telling the cashier the bill was not saved and must be re-entered (today the rollback branch is silent and the keep branch says "Sale was saved").
- Rollback already soft-cancels (`deleted_at`, `is_cancelled`, `cancelled_reason`, `payment_status='cancelled'`) — reused as-is, so no new deletion path.
- Backfill migration: soft-cancel `sales` rows where `deleted_at IS NULL AND is_cancelled = false`, `payment_status <> 'hold'`, and no live `sale_items` row exists, with `cancelled_reason = 'empty bill (no line items) — bulk cleanup 2026-09-16'`. Statement is org-agnostic by design but touches only the 66 rows matched above; no `sale_items` deletion needed since there are none.
- No change to stock, ledger, voucher or settlement logic — these bills never moved stock; the paid ones already sit as unexplained receipts and will be reviewed separately.
