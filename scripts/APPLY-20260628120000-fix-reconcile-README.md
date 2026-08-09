# Apply `20260628120000_fix_reconcile_gross_invoiced_cn_receipts` (live)

## Why

Customer Ledger KPI cards that still read the SQL financial snapshot show ₹0 when
this migration was never applied. The file exists in
`supabase/migrations/20260628120000_fix_reconcile_gross_invoiced_cn_receipts.sql`
but may be absent from `supabase_migrations.schema_migrations`.

## Steps (Supabase SQL editor, service role)

1. Confirm:
   ```sql
   select version from supabase_migrations.schema_migrations
   where version = '20260628120000';
   ```
2. If empty — paste and run the full contents of
   `supabase/migrations/20260628120000_fix_reconcile_gross_invoiced_cn_receipts.sql`.
3. Record the version (so drift reports stay honest):
   ```sql
   insert into supabase_migrations.schema_migrations (version)
   values ('20260628120000')
   on conflict do nothing;
   ```
   (Column set may vary by Supabase version — if `insert` fails, use the
   Dashboard “Migration history” / CLI `supabase migration repair` path instead.)
4. Hard-refresh the app; re-open ANUSHA PATHAN ledger.

## Drift report (all missing repo migrations)

Run `scripts/report-schema-migrations-drift.sql` and paste the result set into
the PR / incident note. This is the third live-vs-repo drift this month — treat
a non-empty report as a release-process failure, not a one-off.
