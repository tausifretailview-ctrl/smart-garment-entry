# Close the anonymous RPC hole (confirmed exploitable)

## What was confirmed just now

The chain is real. An unauthenticated POST with only the publishable key returned live
inventory rows:

```text
POST /rest/v1/rpc/get_low_stock_alerts  {"p_org_id":"<real org uuid>"}   -> 200, rows
```

The guard in that function is exactly the fail-open shape:

```sql
IF auth.uid() IS NOT NULL THEN
  IF NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization';
  END IF;
END IF;
```

Anonymous caller -> `auth.uid()` is NULL -> the whole check is skipped, and
`SECURITY DEFINER` bypasses RLS. Counts from the live database:

- 95 `SECURITY DEFINER` VOLATILE (writing) functions in `public` are anon-executable.
- 38 anon-executable `SECURITY DEFINER` functions contain the `auth.uid() IS NOT NULL`
  fail-open guard, including `get_customer_party_balances`, `get_stock_report`,
  `reconcile_customer_balance_v2`, `run_nightly_balance_reconciliation`,
  `save_purchase_bill_with_items_atomic`, `repair_customer_floating_adjustments`.

Finding 2 outranks finding 1. Org UUIDs are not secret (they appear in forwarded
`serve-wappconnect-pdf` links), so a WhatsApp forward is a plausible entry point.

## Order of work

### 1. Revoke anon EXECUTE on the writing subset (tonight)

Generate the list, don't hand-write it:

```sql
select format('REVOKE EXECUTE ON FUNCTION %s FROM anon;', p.oid::regprocedure)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and p.provolatile = 'v'
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by 1;
```

Review before running. Trigger functions in that list (`update_stock_on_sale`,
`audit_*`, `handle_*_delete`) are never called over PostgREST, so revoking is free.
Keep on the allowlist anything an unauthenticated screen actually calls. From the code
the only confirmed unauthenticated RPC is `get_org_public_info` (org branding on
`OrgAuth.tsx`); the buyer portal goes through edge functions with `x-portal-token`, not
direct RPC. The allowlist gets re-derived from the code before the migration is written,
not assumed.

Deliver as one migration with explicit `REVOKE ... FROM anon;` lines, plus a
`GRANT EXECUTE ... TO authenticated;` where a revoke would otherwise strip an
already-implicit `PUBLIC` grant the app relies on.

### 2. Fix `sync-whatsapp-templates`

Same shape as `auto-backup`: service-role client opened on a body-supplied
`organizationId` with no caller identity. Fix: read the `Authorization` header,
`getUser()`, 401 if absent, then confirm the caller is a member of `organizationId`
(admin/manager) before the service-role client is created. It is user-driven from the
WhatsApp settings screen, not cron, so `getUser()` is the right guard — no dispatch
secret. `SyncMetaTemplates.tsx` already invokes it through `supabase.functions.invoke`,
which forwards the session, so no client change is needed.

### 3. Repair the guards themselves, then revoke the read-only set

Revoking anon EXECUTE removes the reachable path, but the fail-open guard is still
wrong for any future grant. Change the pattern in the 38 affected functions from
"check only if signed in" to "require a caller":

```sql
IF auth.uid() IS NULL
   OR NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
  RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
END IF;
```

Functions legitimately called from edge functions under the service role need an
`auth.role() = 'service_role'` escape in the same condition — each one gets checked
against its callers before editing. This is a larger, riskier batch than steps 1-2, so
it runs after them, in a quiet window, with the read-only anon revokes landing in the
same pass.

### 4. Review checklist item

The same defect has now appeared five times: **a service-role client opened before the
caller is established.** Add to `.cursor/rules/backend-core-invariants.mdc`:

- No `SUPABASE_SERVICE_ROLE_KEY` client may be constructed before `getUser()`, a
  verified signature, or the dispatch secret has identified the caller.
- Tenant selection never comes from the request body alone — the body's
  `organizationId` must be checked against the verified caller's memberships.
- Org guards in `SECURITY DEFINER` functions fail closed: never
  `IF auth.uid() IS NOT NULL THEN ... END IF;`.

## Verification

After step 1, re-run the confirming curl with no session — expect
`42501 / permission denied for function`. After step 2, an unauthenticated POST to
`sync-whatsapp-templates` expects 401, and the settings-screen sync still works signed
in. After step 3, re-run the `has_function_privilege('anon', ...)` census and expect
only the allowlist to remain.

## Not in this plan

`serve-wappconnect-pdf` caller binding, `get-public-invoice` PII gating, service-role
key rotation, and `verify_jwt = true` pinning for `run-drift-detection` /
`run-invariant-digest` stay on the deliberate list from the audit.
