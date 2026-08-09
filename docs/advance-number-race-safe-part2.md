# Part 2.0 — Race-safe `generate_advance_number`

**Branch / migration:** `fix/advance-number-race-safe` →  
`supabase/migrations/20261110120000_advance_number_race_safe.sql`  
**Date:** 2026-08-09  
**Triage:** [voucher-number-race-safe-part2-triage.md](./voucher-number-race-safe-part2-triage.md)

## Series scope (deliberate)

**Keep per-org** `ADV/YY-YY/N` (RPC already takes `p_organization_id`).

Lock key: `hashtext(org_id || ':ADV:' || fy)`.

## What the migration does

1. **LOCK** `customer_advances` (EXCLUSIVE) for cleanup + unique.
2. **Cleanup** duplicate `(organization_id, advance_number)` groups: keep oldest (`created_at`, then `id`); rename extras to `…#d` + short id.
3. **UNIQUE** `uq_customer_advances_org_number` on `(organization_id, advance_number)`  
   (table has no `deleted_at`).
4. **Replace** `generate_advance_number` with advisory lock + MAX+1 + EXISTS loop (IST FY, ignore `#d` from MAX).

## App TOCTOU mitigation

`createCustomerAdvance` (`src/utils/createCustomerAdvance.ts`) retries insert up to 8× on `23505` / `uq_customer_advances_org_number`, regenerating via RPC each attempt.

Wired from:
- `useCustomerAdvances.tsx` (Advance Booking)
- `CustomerBalanceAdjustmentDialog.tsx`
- `RecentBalanceAdjustments.tsx`
- `CustomerBalanceImportDialog.tsx`

## Apply (Supabase SQL editor / Lovable)

1. Preflight: first query in `scripts/part2-number-series-dup-forensic.sql` (ADV block).
2. Run the migration file on a quiet window (table lock).
3. Record version in `schema_migrations` if applying outside CLI.
4. Hard-refresh app; book two advances concurrently → distinct `ADV/…` numbers.

## Smoke

```sql
-- Two sessions / parallel connections, same org:
SELECT generate_advance_number('<org-uuid>');
-- Expect distinct ADV/YY-YY/N values.
```

## Out of scope

- DC / CN / SR / SO generators (later Part 2 items).
- Changing ADV to a global series.
- Auto-deleting duplicate money rows (rename only).
