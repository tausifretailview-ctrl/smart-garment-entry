# SECURITY DEFINER audit (Plan Phase 4, C4) — 13 Nov 2026

SECURITY DEFINER functions run with the owner's rights and skip Row Level Security. Each one
that a logged-in user can call must check that the caller belongs to the shop whose data it
reads or changes.

## What protects them today

| Layer | Where | What it does |
|---|---|---|
| No anonymous calls | `20260818024449`, `20260818030347` | EXECUTE revoked from `anon`/PUBLIC; default privileges revoke it for new functions. Only the login page / storefront functions are granted to `anon` on purpose. |
| Guard pass (27 Sep 2026) | `20261231120100_security_org_guards_on_definer_functions.sql` | Rewrote the **live** definition of every definer function taking a shop id (`p_organization_id`, `p_org_id`, `p_org`) or a record id (`p_sale_id`, `p_bill_id`, …) to start with `_assert_org_access` / `_assert_row_org_access`. That is why many repo copies (e.g. `get_sales_summary`) show no check: the check was added live, not in the copy. |
| Re-guard | `20270211120000_security_reguard_october_definer_functions.sql` | Put the check back on functions a later `CREATE OR REPLACE` had rewritten without it (`reset_stock_from_transactions`, `reconcile_variant_stock_qty`, …). |
| CI check | `src/lib/securityDefinerOrgGuard.guard.test.ts` | Fails when a function (re)defined after the guard pass takes a shop/record id and neither checks membership, nor is revoked from `authenticated`, nor is named in the re-guard. |

## What this audit found

All 291 non-trigger definer functions in the repo set `search_path`. Read against the layers
above, two still let a user of one shop read another shop's data — both take a **list** of ids
and no shop id, so the guard pass (single ids only) never matched them:

| Function | Leaked | Fix |
|---|---|---|
| `get_sale_items_gross_batch(p_sale_ids uuid[])` | line totals of any bill | `20270425120000`: rows limited to the caller's shops |
| `get_stock_at_time_batch(p_variant_ids uuid[], ts)` | stock history of any product (only anonymous callers were blocked) | same |

Ids are random UUIDs, so this needed ids from the other shop — low likelihood, but the data is
private. The fix keeps the same arguments and columns; the caller's own shop gets the same
numbers, so the app does not change. The CI check now also fails for any definer function that
takes a list of ids, has no shop id, and does not limit rows to the caller's shops.

Checked and fine: `accept_stock_transfer` / `reject_stock_transfer` (`_stock_transfer_can_receive`),
`settle_stock_session` (`assert_org_member`), `platform_add_whatsapp_credits` and
`run_nightly_stock_drift_check` (platform admin), `get_pos_dashboard_stats` (member check; its
"no login → allowed" branch only matters if `anon` can execute it — the live query below shows
`anon_can_call`).

## Apply (not done from here)

Run `supabase/migrations/20270425120000_definer_id_array_readers_shop_scope.sql` in the SQL
editor / Lovable pipeline. It only replaces two read functions and adds one helper.

## Check the live database (read-only)

The repo copies cannot show checks that were added live, or functions changed outside the
repo. This lists live definer functions a logged-in user can call that take a shop or record id
(single or list) and contain no membership check. Expect only deliberate exceptions
(public website / login functions):

```sql
SELECT p.oid::regprocedure AS function,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_call
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND p.prokind = 'f'
  AND p.prorettype NOT IN ('trigger'::regtype, 'event_trigger'::regtype)
  AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  AND EXISTS (
    SELECT 1
    FROM unnest(p.proargnames[1:p.pronargs]) WITH ORDINALITY a(name, ord)
    WHERE format_type(p.proargtypes[a.ord - 1], NULL) IN ('uuid', 'uuid[]')
      AND a.name ~ '^p_(org|organization_id|org_id|\w+_ids?)$')
  AND p.prosrc !~* '(organization_members|user_belongs_to_org|get_user_organization_ids|has_org_role|is_org_admin|_assert_org_access|_assert_row_org_access|assert_org_member|platform_admin|_caller_org_scope|_stock_transfer_can_receive)'
  AND p.proname !~ '^(has_|is_|_assert_|user_belongs_to_org$|get_user_organization_ids$)'
ORDER BY 1;
```

Anything else in the result is a function to guard (add
`PERFORM public._assert_org_access(<shop id>);` after `BEGIN`) or to revoke from `authenticated`
if only edge functions call it.
