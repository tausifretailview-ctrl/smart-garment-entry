# Wrap `auth.uid()` in RLS policies (InitPlan hoisting)

## Confirmed state (live queries, this session)

- `public` has **361 policies**; **268** have unwrapped `auth.uid()` in `qual`, **117** in `with_check`.
- Helper functions are already `STABLE` + `SECURITY DEFINER` — no volatility change needed:
  - `get_user_organization_ids(user_id uuid)` — STABLE
  - `has_org_role(user_id, org_id, required_role)` — STABLE
  - `has_role(_user_id, _role)` — STABLE
  - `assert_org_member(p_org)` — STABLE
- Current scan counters (baseline to beat):

```text
organization_members  seq_scan 2,733,766,481  seq_tup_read 110,276,118,764
user_roles              332,866,374            16,216,573,055
product_variants         55,777,471         1,190,633,297,901
sale_items                6,861,265           645,479,677,135
sales                       629,315            17,456,104,521
```

## What changes

Only the evaluation frequency: every unwrapped `auth.uid()` inside a policy
expression becomes `(select auth.uid())`. Covers all three shapes:
bare comparisons, `get_user_organization_ids(auth.uid())`, and
`has_org_role(auth.uid(), …)`. No consolidation, no renames, no role changes,
no other work bundled in.

## Method

1. **Snapshot first** — dump `pg_policies` (schemaname, tablename, policyname,
   cmd, roles, qual, with_check) for all 361 policies to
   `docs/rls-policy-snapshot-<date>.sql` in the repo. Rollback reference.
2. **Generate, don't hand-write** — a script reads the snapshot, applies the
   wrapping by regex on `auth.uid()` occurrences not already preceded by
   `select `, and emits `DROP POLICY` / `CREATE POLICY` pairs preserving name,
   cmd, roles, qual, with_check verbatim otherwise.
3. **Batch by table**, one migration per batch, run and verified in order:
   - Batch 1: `sales`, `sale_items`, `product_variants`, `products`
   - Batch 2: `customers`, `voucher_entries`, `purchase_bills`, `purchase_items`
   - Batch 3: `organization_members` (9 policies), `user_roles` (5)
   - Batch 4+: remaining tables, alphabetical, ~20 per migration
   `organization_members` / `user_roles` sit in their own batch because they are
   the tables the other policies read; a mistake there is the widest blast radius.
4. **Post-batch diff** — re-dump policies and diff against the snapshot; the only
   textual difference permitted is `auth.uid()` → `(select auth.uid())`.

## Verification per batch

Run as a real non-admin org user (session restored in the preview), before and
after each batch:

- Row counts on 3-4 tables in the batch match exactly, pre vs post.
- A record id known to belong to another org is still unreadable.
- One INSERT and one UPDATE succeed (catches a broken `with_check`, which shows
  up as "save failed" rather than a wrong list).
- An admin user still sees the elevated rows they saw before.

If any check fails, the batch's migration is reverted from the snapshot before
proceeding.

## Measurement

Recorded before batch 1 and again after all batches, with `stats_reset` noted so
the windows are comparable:

- `seq_scan` / `seq_tup_read` on `organization_members` and `user_roles`
- wall-clock for Sales Invoice Dashboard, All Time, ~1,000 rows
- `pg_stat_statements` total_exec_time for the top 5 queries

Success is the scan counters dropping, not the diff looking clean.

## Explicitly out of scope

`product_variants`' 55.7M seq scans are likely nested-loop re-scans from
application queries, not policy re-evaluation. If they persist after the fix,
that is a separate investigation along with the two heavy queries
(25.87ms x 14,585 calls, 28.51ms x 5,124 calls) that need their own indexes.
No policy is disabled or simplified at any point to "test whether RLS is the cost".
