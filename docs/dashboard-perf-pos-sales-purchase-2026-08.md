# Dashboard perf — POS, Sales, Purchase (Aug 2026)

Follow-up to party balances v2 swap. Targets the three dashboards requested for faster first paint.

## Apply on Lovable

```text
20260823150000_dashboard_perf_receipts_purchase.sql
```

Confirm live with `pg_get_functiondef` for:
- `get_sale_receipt_voucher_rows_batch`
- `search_purchase_bill_ids`
- `get_purchase_bills_dashboard_page` (line-item search path)

Frontend changes deploy via Vercel (no migration).

---

## Changes

### SQL (`20260823150000_dashboard_perf_receipts_purchase.sql`)

| Function | What it fixes |
|----------|----------------|
| `get_sale_receipt_voucher_rows_batch` | One SQL call for receipt rows on a dashboard page (sale ids + customer ids). Replaces multiple paginated PostgREST voucher crawls. |
| `search_purchase_bill_ids` | UNION line-item search (mirrors `search_invoice_sale_ids`). |
| `get_purchase_bills_dashboard_page` | Uses search RPC instead of correlated `EXISTS` on `purchase_items` per bill. |

### Client

| Area | Change |
|------|--------|
| **POS Dashboard** | Split fetch like Sales Invoice: table paints with `reconcile: false` (at-sale tender + CN enrich), receipt settlement runs in background query. |
| **Sales Invoice Dashboard** | Already split; benefits from batch receipt RPC on background reconcile. |
| **Purchase Dashboard** | No client change; faster when page RPC migration is applied. |

---

## Sales Invoice — already optimized (verify applied)

These migrations must be live for stats KPI speed:

- `20261112120000_fix_invoice_dashboard_stats_timeout.sql` — ELLA NOOR stats timeout fix
- `20260822120000_invoice_dashboard_stats_search_params.sql` — search/customer scope on stats RPC

If stats tiles still slow on wide date ranges, run:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT get_invoice_dashboard_stats(
  '<ORG_UUID>'::uuid,
  now() - interval '7 days', now(),
  '{}'::jsonb, NULL, NULL
);
```

Optional follow-up: scope `items_gross` to `sale_return_adjust > 0` inside stats RPC (same argument as party balances v2).

---

## POS Dashboard — before / after behavior

**Before:** `fetchPosDashboardPage` blocked on `enrichPosSalesWithReceiptSettlement` (voucher crawl) before table rendered.

**After:** Table renders from at-sale columns + credit note enrich (~100–300 ms). Receipt reconcile updates paid/status/mode columns in background.

---

## Purchase Dashboard — before / after

**Before:** Each bill in search/filter path ran `EXISTS (SELECT 1 FROM purchase_items …)`.

**After:** Line-item matches precomputed via `search_purchase_bill_ids`, then `b.id IN (…)`.

---

## Parity / smoke checks

**Purchase page (with search term):**

```sql
-- Row counts should match before/after if replacing live function on staging
SELECT (get_purchase_bills_dashboard_page('<ORG>'::uuid, ...))->>'total_count';
```

**Batch receipts (any org, 5 sale ids from recent POS):**

```sql
SELECT count(*) FROM get_sale_receipt_voucher_rows_batch(
  '<ORG>'::uuid,
  ARRAY['<sale-id>'::uuid, ...],
  NULL, NULL, NULL
);
```

---

## Out of scope (separate tracks)

- Payments Dashboard (loads all matching sales — needs server pagination RPC)
- POS/Sales stats RPC rewrites beyond existing Nov 2026 invoice stats fix
- New indexes (measure first)
