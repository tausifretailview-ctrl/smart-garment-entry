# Part 1 — Race-safe `generate_voucher_number`

**Branch / migration:** `fix/voucher-number-race-safe` → `supabase/migrations/20261109120000_voucher_number_race_safe.sql`  
**Date:** 2026-08-09

## Series scope decision (deliberate)

**Keep the existing global series** (no `organization_id` filter).

| Option | Effect |
|--------|--------|
| Global + lock (chosen) | Future RCP/PAY/… numbers continue as today; only concurrency is fixed. No shop sees a “reset” or jump relative to other orgs. |
| Per-org | Cleaner isolation, but each org’s next number would diverge from the historical global counter — user-visible numbering change. Requires communication. **Not done here.** |

Lock key: `hashtext('voucher:' || prefix || ':' || financial_year)` — same dimensions as the MAX scan.

## What the migration does

1. **LOCK** `voucher_entries` (SHARE ROW EXCLUSIVE) for the migration transaction.
2. **Cleanup** active duplicate `voucher_number` groups: keep oldest (`created_at`, then `id`); rename extras to `…#d` + short id (does not match trailing-`(\d+)$`, so MAX sequence is unchanged). **No deletes.**
3. **UNIQUE** `uq_voucher_entries_number_active` on `voucher_number WHERE deleted_at IS NULL`.
4. **Replace** `generate_voucher_number` with advisory lock + MAX+1 + EXISTS loop (same pattern as custom sale/POS).

## Apply notes (Lovable / SQL editor)

- Apply on a quiet window if possible; the table lock blocks concurrent voucher inserts briefly.
- If unique index create fails, some duplicate shape was not cleaned — inspect:
  ```sql
  SELECT voucher_number, count(*)
  FROM voucher_entries
  WHERE deleted_at IS NULL
  GROUP BY 1 HAVING count(*) > 1;
  ```
- After apply, watch `v_accounting_invariants` / `duplicate_voucher_number` — should stop growing (existing renamed rows leave the check if the view keys on exact number groups among active rows).

## Concurrent test (must be parallel)

With the migration applied on staging:

```sql
-- Session A and B (or a script with N parallel connections), same second:
SELECT generate_voucher_number('receipt', CURRENT_DATE);
-- Expect distinct RCP/YY-YY/N values; second insert of a forced collision should hit unique index.
```

Or from two browsers / two app instances: save two receipts at once → two different RCP numbers.

## Out of scope

- Sale/POS numbering (already race-safe).
- ADV/DC/PO/CN generators (Part 2 triage).
- Making the series per-org.
- Rewriting ambiguous `customer_ledger_entries.voucher_no` labels for renamed dups.
