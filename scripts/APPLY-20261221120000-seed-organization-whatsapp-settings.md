# Apply `20261221120000_seed_organization_whatsapp_settings` (live)

## Why

"Add another organization" fails immediately with:

```
function public.seed_organization_whatsapp_settings(uuid) does not exist
```

Postgres `42883`. Live `create_organization` already `PERFORM`s this function
(body from `20260625120000`). The `CREATE FUNCTION` from `20260605130000` /
`20260625120000` is **not** in the live database (anon PostgREST probe:
`PGRST202`, hint `get_org_whatsapp_stats`).

Do **not** paste `20260625120000_whatsapp_third_party_org_defaults.sql` in full.
That file UPDATEs every `whatsapp_api_settings` row and replaces
`platform_create_organization`.

Cursor cannot apply this (no `SUPABASE_SERVICE_ROLE_KEY` / SQL editor session).
Same Lovable SQL-editor discipline as `get_net_profit_kpis`.

## Steps (Supabase SQL editor, service role)

1. Confirm the function is missing and whether the original migrations were recorded:

   ```sql
   SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'seed_organization_whatsapp_settings';

   SELECT version, name
   FROM supabase_migrations.schema_migrations
   WHERE version IN ('20260605130000', '20260625120000', '20261221120000')
   ORDER BY version;
   ```

   Expected before apply: zero `pg_proc` rows. `schema_migrations` may or may not
   list `20260605` / `20260625` — a version row is not proof the function exists.

2. Paste and run the full contents of
   `supabase/migrations/20261221120000_seed_organization_whatsapp_settings.sql`.
   Safe to re-run (`CREATE OR REPLACE`).

3. Record the version (so drift reports stay honest):

   ```sql
   INSERT INTO supabase_migrations.schema_migrations (version)
   VALUES ('20261221120000')
   ON CONFLICT DO NOTHING;
   ```

   Column set may vary — if `INSERT` fails, use Dashboard migration history /
   `supabase migration repair`.

4. Confirm the function exists:

   ```sql
   SELECT pg_get_functiondef(p.oid)
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'seed_organization_whatsapp_settings';
   ```

5. Anon PostgREST probe (expect **401** `permission denied` / `42501`, **not**
   `PGRST202`):

   ```bash
   curl -sS -X POST "$SUPABASE_URL/rest/v1/rpc/seed_organization_whatsapp_settings" \
     -H "apikey: $ANON_KEY" \
     -H "Authorization: Bearer $ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"p_organization_id":"00000000-0000-0000-0000-000000000001"}'
   ```

6. Retry **Add another organization** on a real account. Do not create orgs from
   this agent (production backend, no test credentials).

## Do not apply

- `20260605130000` — embeds a hardcoded `access_token` into `platform_settings`.
- Full `20260625120000` — mutates existing WhatsApp rows and replaces
  `platform_create_organization`.
