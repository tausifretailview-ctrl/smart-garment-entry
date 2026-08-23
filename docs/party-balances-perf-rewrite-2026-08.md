# Party balances performance rewrite — Aug 2026

Parity-gated rewrite of `public._get_customer_party_balances_rows` → `_v2`.

Migrations:

| File | Action |
|------|--------|
| `20260823140000_party_balances_rows_v2.sql` | Creates `_get_customer_party_balances_rows_v2` — **apply first** |
| `20260823140100_party_balances_swap_to_v2.sql` | Repoints live helper to v2 — **DO NOT apply until gates pass** |

Parity script: `scripts/party-balances-parity.sql`

---

## Baseline (live `_get_customer_party_balances_rows`, 2026-08-23, idle instance)

`EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM public._get_customer_party_balances_rows('<org>'::uuid);`

| Org UUID | Customers | Execution time | Buffers (8 kB pages) |
|----------|-----------|----------------|----------------------|
| `ceb7f3dd-3619-4718-a8c1-43a02252e5b9` | 2,301 | 1,600 ms | 1,008,281 |
| `697c451a-f863-4fe4-82f3-31859a9e5251` | 16,903 | 5,426 ms | 2,378,056 |

Reference: June 2026 parity-verified version returned 7,476 parties in **192 ms** before the `paid_at_sale_drift` regression.

Database scale (all orgs): ~47,300 `sales`, ~134,400 `sale_items`.

---

## Root cause

Three patterns in the live helper:

1. **`paid_at_sale_drift`** — correlated subquery re-scans `voucher_entries` per qualifying sale row (dominant cost).
2. **`receipt_payments` leg A** — `s.id::text = ve.reference_id::text` text cast prevents index use on `reference_id`.
3. **`items_gross`** — aggregates every `sale_items` row in the org; result only used where `sale_return_adjust > 0`.

Patterns (1) and (2) compute overlapping aggregates over the same table. Fix: **`sale_receipts` CTE** scans `voucher_entries` once.

---

## Changes in v2 (no arithmetic / filter / column changes)

### `sale_receipts` (new CTE)

Single pass over org receipt vouchers, grouped by `reference_id::text`:

- **`amt_all`** — all receipt settlement amounts (includes `advance_adjustment`). Used by `paid_at_sale_drift`.
- **`amt_excl_advance`** — same sum with `FILTER` excluding `advance_adjustment` and advance-balance description. Used by `receipt_payments` leg A.

These must **not** be collapsed into one sum — substituting one for the other moves balances by exactly the customer's advance-adjustment receipt total.

### `receipt_payments` leg A

Inner join to `sale_receipts` on `sale_ref = s.id::text`, reading `amt_excl_advance`.

**Preserved:** leg A reads `public.sales`, not `valid_sales` — receipts on cancelled/hold sales still count even though those sales' invoices are excluded.

Leg B (customer-level receipts with `NOT EXISTS`) unchanged.

### `paid_at_sale_drift`

Correlated subquery replaced with `LEFT JOIN sale_receipts`, using `amt_all`. All `GREATEST` nesting, `WHERE` predicates, `drift > 0` filter, and `GROUP BY` unchanged.

### `items_gross` scoping

```sql
INNER JOIN valid_sales s2 ON s2.id = si.sale_id
WHERE si.deleted_at IS NULL
  AND COALESCE(s2.sale_return_adjust, 0) > 0
```

**Output-identical argument:** `items_gross` is consumed only by `sale_return_adjust`, whose `CASE` requires both `COALESCE(ig.gross, 0) > 0` AND `COALESCE(s.sale_return_adjust, 0) > 0`. For any sale with `sale_return_adjust = 0`, the CASE already falls to `ELSE COALESCE(s.sale_return_adjust, 0)` = 0. Dropping those rows from `items_gross` turns `ig.gross` into NULL for them, which routes to the same ELSE branch and the same 0.

### Left alone

`pending_sale_returns` correlated subquery (PK lookup on `sales.id`, small `sale_returns` table) — not touched.

**No new indexes** in this change.

---

## Parity gate

Run `scripts/party-balances-parity.sql` per org after applying v2 migration only.

**Required orgs:**

| Org UUID | Why |
|----------|-----|
| `697c451a-f863-4fe4-82f3-31859a9e5251` | Largest (16,903 customers) |
| `3fdca631-1e0c-4417-9704-421f5129ff67` | ELLA NOOR — credit notes, advances, `legacy_paid_baseline`, pre-2026-05-29 `CustomerReceipt` vocabulary |
| `ceb7f3dd-3619-4718-a8c1-43a02252e5b9` | Mid-size control (2,301 customers) |
| `0b3a8035-1bf6-40a0-b038-8f0406c93c18` | 1,271 customers |
| `ad86a484-8557-4186-9cba-e1805faaeb9b` | Small org (660 customers) |

**Pass criteria:**

- Row-count query: `old_rows = new_rows`
- Diff query: **zero rows**

Record results here after running on live:

| Org UUID | old_rows | new_rows | diff_rows | Pass? |
|----------|----------|----------|-----------|-------|
| `697c451a-f863-4fe4-82f3-31859a9e5251` | | | | |
| `3fdca631-1e0c-4417-9704-421f5129ff67` | | | | |
| `ceb7f3dd-3619-4718-a8c1-43a02252e5b9` | | | | |
| `0b3a8035-1bf6-40a0-b038-8f0406c93c18` | | | | |
| `ad86a484-8557-4186-9cba-e1805faaeb9b` | | | | |

---

## Performance gate (after parity passes)

```sql
SET statement_timeout = '120s';
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM public._get_customer_party_balances_rows_v2('<ORG_UUID>'::uuid);
```

Record v2 results here:

| Org UUID | v2 execution time | v2 buffers | Baseline buffers | ≥10× buffer drop? |
|----------|-------------------|------------|------------------|-------------------|
| `ceb7f3dd-3619-4718-a8c1-43a02252e5b9` | | | 1,008,281 | Target: < 100,000 |
| `697c451a-f863-4fe4-82f3-31859a9e5251` | | | 2,378,056 | Must fit 8 s ceiling with concurrency headroom |

**Buffers is the real measure** — time varies with cache/load. Do not swap on modest time improvement alone if buffers have not dropped by at least an order of magnitude.

---

## Apply sequence

1. Apply `20260823140000_party_balances_rows_v2.sql` on Lovable cloud.
2. Confirm with `pg_get_functiondef('public._get_customer_party_balances_rows_v2(uuid)'::regprocedure)` — live schema may drift from migration history.
3. Run parity gate on all 5 orgs; fill table above.
4. Run performance gate on the two measured orgs; fill table above.
5. Only then apply `20260823140100_party_balances_swap_to_v2.sql`.
6. Re-run parity on one org post-swap (wrapper should be transparent).

---

## Schema drift note

Live schema has drifted from `supabase/migrations` at least four times recently (functions running live absent from migration history; at least one committed migration never applied). Always verify with `pg_get_functiondef` after applying — do not assume merge deployed it.

If parity fails against live helper but passes against migration-file body, the live function may differ from `20260822183000_snapshot_facet_semantics.sql` (e.g. later receipt/drift parity migrations). Reconcile live body before swapping.
