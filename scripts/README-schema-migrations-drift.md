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

## Live compare (nightly GitHub Action)

`.github/workflows/schema-migrations-drift.yml` runs `npm run check:schema-drift:live`
(`--require-live`) on cron `15 2 * * *` and `workflow_dispatch`.

It **fails closed**. Missing credentials are an error, not a green skip. The
17 Sep 2026 07:37 UTC run printed empty `SUPABASE_DRIFT_*` secrets and `exit 0`
before the compare — that wrapper is gone.

### GitHub Actions secrets (Tausif / Lovable Cloud)

`gh secret list` is 403 from this agent. The 17 Sep job log showed all three
values empty, so they were never set (GitHub injects `""` for a missing secret).
Cursor cannot mint a service-role key.

Repo → **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `SUPABASE_DRIFT_URL` | `https://lkbbrqcsbhqjvsxiorvp.supabase.co` (optional; the workflow defaults this production URL when unset) |
| `SUPABASE_DRIFT_SERVICE_ROLE_KEY` | **Required.** Lovable Cloud → this Supabase project → service_role key. Not the anon / `VITE_SUPABASE_PUBLISHABLE_KEY`. |
| `ALLOW_PRODUCTION_DRIFT_CHECK` | **Required** as the literal `1`. There is no staging project; production is refused without this flag. |

Then run **Actions → Schema migration drift → Run workflow**. The log must show
`Repo versions:` / `Live versions:` (or `Schema-migration drift detected`), never
`Skipping live compare`.

Local:

```bash
# Staging (preferred when a staging project exists)
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
