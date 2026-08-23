# Schema-migration drift check

Repo files under `supabase/migrations/` and the live `supabase_migrations.schema_migrations` table have drifted in **both** directions this month. A commit is not proof a migration ran. This check exists so "fixed" means either "applied live" or "explicitly reported missing."

## Repo-only (CI)

```bash
npm run check:schema-drift
```

Compares `supabase/migrations/*.sql` to `scripts/schema-migrations-manifest.json`. After adding a migration:

```bash
npm run check:schema-drift:write
```

Commit the updated manifest in the same change.

A green `--check` only proves the manifest matches the files on disk. It does **not** prove production applied them.

The repo already has a handful of files that share a 14-digit prefix. Live `schema_migrations` can store each version only once, so the check compares unique versions to live and also tracks the full file list so a new colliding filename still fails CI until the manifest is regenerated.

## Live compare (staging or deliberate production)

Needs a service-role key. Never point this at production from a default CI job.

```bash
# Staging (preferred)
SUPABASE_DRIFT_URL=https://<staging-ref>.supabase.co \
SUPABASE_DRIFT_SERVICE_ROLE_KEY=... \
npm run check:schema-drift:live
```

Or reuse `.env.test` staging credentials (`SUPABASE_TEST_URL` + `SUPABASE_TEST_SERVICE_ROLE_KEY`).

Production is refused unless you pass `--allow-production` or set `ALLOW_PRODUCTION_DRIFT_CHECK=1`.

`--require-live` fails when credentials are missing (used by the scheduled workflow).

## What it reports

1. **CRITICAL** versions in `CRITICAL_SCHEMA_MIGRATIONS` (purchase stock floor, settlement normalizer, CN reconcile) that are not live.
2. In repo, not live — committed SQL that never ran.
3. In live, not repo — applied outside git.

## Manual SQL

`scripts/report-schema-migrations-drift.sql` is a pointer only. Use this script; do not maintain a generated 700-line version list by hand.
