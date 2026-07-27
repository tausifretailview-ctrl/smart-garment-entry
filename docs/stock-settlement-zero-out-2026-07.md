# Stock Settlement — zero unscanned stock (Phase 1)

**Date:** 2026-07-27  
**Scope:** Read-only investigation. No code, no migrations, no stock writes.  
**Goal of eventual Phase 2:** After a physical count session, review variants the system still shows in stock that were never scanned, then write them off (set `stock_qty = 0`) in one confirmed, audited, batched action — **not** via fake POS sales.

---

## One-line answer (1A)

**Yes — `settle_stock_session` already writes an audit trail:** for every scanned row with a non-zero delta it inserts a `stock_movements` row (`movement_type = 'reconciliation'`, `reference_id = settlement_session_id`) and always updates `product_variants.stock_qty` to the counted qty.

---

## 1A. How `settle_stock_session` writes stock

**Definition:** `supabase/migrations/20261003170000_stock_settlement_scans.sql`  
**Client:** `settleStockSession()` → RPC only (`src/utils/stockSettlementScans.ts`).

### What it updates

For each `stock_settlement_scans` row with:

- `organization_id = p_organization_id`
- `settlement_session_id = p_session_id`
- `settled = false`

in `scanned_at` order:

1. **`product_variants.stock_qty`** ← `GREATEST(0, ROUND(counted_qty)::integer)` (scoped by `variant_id` + `organization_id`)
2. **`stock_movements` insert** — only if `delta = counted_qty − system_qty <> 0`:
   - `movement_type = 'reconciliation'` (allowed by check constraint)
   - `quantity = delta` (signed)
   - `reference_id = p_session_id`
   - `notes = 'Stock settlement: {system} → {counted} (adjustment: {delta})' [+| note]`
   - `user_id = auth.uid()`
3. After the loop: **all matching scan rows** → `settled = true` (including zero-delta rows)

### What it does **not** do

- Does **not** touch variants with **no** scan row for the session (unscanned stock is untouched today)
- Does **not** create sales / sale_items / vouchers
- Does **not** store a separate “before” column beyond what is already on the scan (`system_qty`) and on the movement note / quantity

### Transaction / atomicity

- `LANGUAGE plpgsql` function body runs as **one Postgres transaction** (implicit). Any exception rolls back stock updates and movements.
- No explicit `BEGIN`/`COMMIT` needed; no autonomous transactions.

### Idempotency

- Guard: if **no** rows exist with `settled = false` for that org+session → `RAISE EXCEPTION 'No open settlement session…'`
- After a successful run, all session scans are `settled = true`, so a **second call fails** rather than double-applying.
- Caveat: success is “session has no open scans,” not a dedicated “zero-out already applied” flag. Phase 2 needs its **own** idempotency key for unscanned write-off (see recommendation).

### Implication for Phase 2

The scanned-path mechanism (set `stock_qty` + `stock_movements` reconciliation + session reference) is the right pattern to **extend**. Do **not** have the client loop `UPDATE product_variants`. Prefer a **new RPC** (or a clearly separated second phase of settlement) rather than silently folding zero-out into `settle_stock_session`, because product requires write-off to be **explicit, separate, and confirmed** after settle of scanned rows.

---

## 1B. What defines “unscanned”?

### Recommended definition (all must hold)

A variant is a write-off candidate for session `S` iff:

| # | Condition |
|---|-----------|
| 1 | `product_variants.organization_id = org` |
| 2 | `product_variants.deleted_at IS NULL` |
| 3 | `product_variants.stock_qty > 0` |
| 4 | **No** row in `stock_settlement_scans` for `(settlement_session_id = S, variant_id)` — **regardless of `counted_qty`** (including `0`) |
| 5 | Same catalogue filters the settlement UI already uses when loading candidates: `active = true`, product `deleted_at IS NULL`, `product_type <> 'service'` |

### Inactive product / inactive variant

| Field | Recommendation | Reasoning |
|-------|----------------|-----------|
| `product_variants.active = false` | **Exclude** from write-off list (and from auto zero) | Settlement load already uses `.eq("active", true)`. Inactive variants were never offered to the counter; zeroing them in this flow is a different cleanup job. |
| `products.status = 'inactive'` | **Include** if the variant is still `active` and meets (1)–(5) | Settlement today does **not** filter `products.status`. Inactive-but-not-deleted products with active variants still appear in the count list; if unscanned with stock, they are phantom stock for this physical count. |

Do **not** decide silently to widen beyond the settlement load set without an explicit UI toggle (“Include inactive variants”).

### Size / value (live)

Could not run privileged SQL from this checkout (RLS / no service role). Use in SQL editor:

```sql
-- Bound to one org; replace UUIDs.
WITH sess AS (
  SELECT '<session_id>'::uuid AS id, '<org_id>'::uuid AS org
),
scanned AS (
  SELECT DISTINCT variant_id
  FROM stock_settlement_scans s, sess
  WHERE s.organization_id = sess.org
    AND s.settlement_session_id = sess.id
)
SELECT
  count(*) AS unscanned_with_stock,
  coalesce(sum(pv.stock_qty), 0) AS total_units,
  round(coalesce(sum(pv.stock_qty * coalesce(pv.pur_price, 0)), 0)::numeric, 2) AS cost_value
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
CROSS JOIN sess
WHERE pv.organization_id = sess.org
  AND pv.deleted_at IS NULL
  AND p.deleted_at IS NULL
  AND pv.active = true
  AND coalesce(p.product_type, '') <> 'service'
  AND pv.stock_qty > 0
  AND NOT EXISTS (SELECT 1 FROM scanned sc WHERE sc.variant_id = pv.id);
```

**Order-of-magnitude expectation:** settlement already pages **all** active non-service variants (1k pages). Orgs with ~20k variants can easily have **thousands** of `stock_qty > 0` unscanned rows after a partial count — hence Phase 2 must be **set-based server RPC**, not a client loop.

### Existing UI note (do not confuse)

`StockSettlement` already has **Auto-Match**: invents scan rows with `counted_qty = softwareStock` for filtered unscanned items (“set to software stock”). That **preserves** system qty. Phase 2 write-off is the opposite: set to **0**. Keep them separate actions with different copy.

---

## 1C. Partially counted variants

Example: scan row `counted_qty = 3`, `system_qty = 10`.

- Variant **has a session scan row** → **not** in the unscanned list.
- On `settle_stock_session`: `stock_qty → 3`, movement `quantity = −7`, notes `10 → 3`.
- Zero-out path must use `NOT EXISTS (scan for session)` so it **cannot** touch this variant.

**Plain statement:** Scanned (including under-count, over-count, or `counted_qty = 0`) is owned exclusively by `settle_stock_session`. Unscanned zero-out owns only variants with **zero scan rows** for that session. No double-adjust.

---

## Recommended Phase 2 implementation (for approval — not built)

### Prefer: new RPC `zero_unscanned_stock_settlement(...)`

Do **not** fold into `settle_stock_session` (must stay scanned-only; write-off must stay optional + confirmed).

Sketch contract:

```text
zero_unscanned_stock_settlement(
  p_organization_id uuid,
  p_session_id uuid,
  p_exclude_variant_ids uuid[] DEFAULT '{}',
  p_confirm_token text,          -- e.g. 'ZERO' or expected count as text
  p_expected_count integer,      -- must match server-computed candidate count after excludes
  p_note text DEFAULT NULL
) RETURNS jsonb
```

**Server steps (single transaction):**

1. `assert_org_member` + **admin/manager** (or same gate as destructive stock tools — align with `stock_settlement` / org role; settlement page today has no extra check beyond menu access).
2. Verify session is **valid** for write-off: prefer “scanned rows already `settled = true`” **or** “explicit open session with ≥1 scan” — product should choose; recommendation: **allow only after scanned settle succeeds**, so physical count of present stock is committed first.
3. Build candidate set with definition 1B, minus `p_exclude_variant_ids`.
4. Abort if `array_length(candidates) <> p_expected_count` or confirm token mismatch.
5. **Idempotency:** if a marker already exists for `(org, session, 'zero_unscanned')` (new small table **or** a sentinel `stock_movements` note / dedicated `stock_settlement_zero_runs` row), return prior result without re-zeroing.
6. **Set-based** update:

```sql
UPDATE product_variants pv
SET stock_qty = 0, updated_at = now()
FROM candidates c
WHERE pv.id = c.variant_id AND pv.organization_id = p_organization_id
RETURNING pv.id, c.prior_qty, c.pur_price;
```

7. **Set-based** insert into `stock_movements`:
   - `movement_type = 'reconciliation'`
   - `quantity = −prior_qty`
   - `reference_id = p_session_id`
   - notes include `Physical Count — not found` + prior qty + session id
8. Persist run header: count, cost value, user, timestamp, excluded ids (for audit / undo).

### UI (2A / 2B)

- New tab or panel on open session: unscanned-with-stock table (product, size/colour, barcode, system qty, cost value), search, sort, paginate.
- Header totals: variant count + `Σ(stock_qty × pur_price)`.
- Per-row **Exclude** (client-only until submit; passed as `p_exclude_variant_ids`).
- Print view of the list.
- Typed confirm (`ZERO` or the count) + dialog with exact count and rupees.
- Admin-only if that matches existing destructive stock permission patterns (`stock_settlement` menu + elevate if needed).

### Reversibility (2C)

**Practical recommendation:** full one-click undo **via RPC** that:

- Reads the zero-run audit (prior `stock_qty` per variant),
- Restores those qtys,
- Inserts compensating `stock_movements` (`+prior_qty`) with note `Reversal: Physical Count — not found`,
- Marks the zero-run reversed (idempotent).

If undo UI is deferred: still **must** store prior qty per variant in the audit table so manual restore is possible. Movement rows alone are recoverable (`quantity` is signed delta) but a first-class `stock_settlement_zero_items(prior_qty)` is clearer.

### Explicit non-goals (Phase 2)

- No POS / sales / sale_items
- No change to scanned behaviour of `settle_stock_session`
- No client-side per-variant stock update loop
- No auto-run on settle

---

## Stop

Phase 1 complete. Phase 2 implemented 2026-07-27:

- Migration `supabase/migrations/20261027120000_stock_settlement_zero_unscanned.sql`
  - Tables `stock_settlement_zero_runs` / `stock_settlement_zero_items` (prior qty audit)
  - RPC `zero_unscanned_stock_settlement` (admin/manager, typed `ZERO`, expected count, after settle only, idempotent)
  - RPC `reverse_unscanned_stock_settlement`
- UI: Stock Settlement **Write Off** tab (`StockSettlementWriteOffTab.tsx`)
- Client helpers in `stockSettlementScans.ts`

**Deploy note:** apply the migration on the Lovable-owned Supabase project before the UI can call the RPCs.
