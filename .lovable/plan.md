## Problem

Opening Sale Return throws:

> Could not find the 'payment_method' column of 'sale_returns' in the schema cache

The recent accounting engine sync (Phase 7-8) added code in `FloatingSaleReturn.tsx`, `SaleReturnEntry.tsx`, `useSoftDelete.tsx`, `journalService.ts`, and `historicalMigration.ts` that **inserts/updates/selects** these columns on `sale_returns`:

- `payment_method` (drives 1000 cash vs 1010 bank GL routing for direct refunds)
- `journal_status` (`pending` / `posted` / `failed`)
- `journal_error` (text, last GL posting error)

…but the database table only has: `id, organization_id, customer_id, customer_name, original_sale_number, return_date, gross_amount, gst_amount, net_amount, notes, created_at, updated_at, return_number, deleted_at, deleted_by, credit_note_id, credit_status, linked_sale_id, refund_type`.

The same gap exists on `purchase_returns` (used by `useSoftDelete.tsx → restore("purchase_returns")` and the Purchase Return flow). It will throw the same error the moment a purchase return is restored or its journal is reposted.

## Root Cause

A migration to add these columns was missed when the journal posting layer was merged. PostgREST's schema cache simply has nothing to expose, so every insert/select/update on these names 4040s.

## Fix (schema-only; no app code changes needed)

Single migration that adds the missing columns to **both** return tables, with safe defaults so existing rows remain valid.

### Migration

```sql
-- sale_returns
ALTER TABLE public.sale_returns
  ADD COLUMN IF NOT EXISTS payment_method  text,
  ADD COLUMN IF NOT EXISTS journal_status  text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS journal_error   text;

-- purchase_returns (same shape, no refund_type needed - already different model)
ALTER TABLE public.purchase_returns
  ADD COLUMN IF NOT EXISTS payment_method  text,
  ADD COLUMN IF NOT EXISTS journal_status  text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS journal_error   text;

-- Helpful index for the auto-repost worker / status filters
CREATE INDEX IF NOT EXISTS idx_sale_returns_journal_status
  ON public.sale_returns (organization_id, journal_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_returns_journal_status
  ON public.purchase_returns (organization_id, journal_status)
  WHERE deleted_at IS NULL;
```

Notes:
- `payment_method` is nullable — credit-note returns legitimately have no payment method.
- Existing rows get `journal_status='pending'`. They were already posted historically (or didn't use the engine), so this only affects the auto-repost worker's view, not user-visible balances.
- No CHECK constraints (per project rule — use validation triggers if needed later).
- All scoped through `organization_id` indexes (per Core memory rule).

### Verification after migration

1. PostgREST schema cache reloads automatically.
2. Open Sale Return for any invoice — the dialog loads without the error.
3. Save a credit-note return → row has `payment_method=null, journal_status='posted'`.
4. Save a cash refund → row has `payment_method='cash', journal_status='posted'`.
5. Soft-delete then restore a sale return from Recycle Bin → no "Ledger warning" toast; `journal_status='posted'`.

## What is NOT changing

- No application/TypeScript code edits — every reference is already correct, just waiting on the columns.
- No data backfill or balance recalculation — historical rows keep their current GL state.
- No changes to `refund_type`, credit-note tables, or RLS policies.
- The Supabase auto-generated `types.ts` will refresh on its own after the migration.
