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
   **permissive**, cmd, roles, qual, with_check) for all 361 policies to
   `docs/rls-policy-snapshot-<date>.sql` in the repo. Rollback reference.
   `permissive` is captured because **4 of the 361 policies are RESTRICTIVE**
   (357 permissive). `CREATE POLICY` defaults to PERMISSIVE, so recreating one
   of those four without `AS RESTRICTIVE` inverts its meaning from "further
   limits access" to "grants access" — and an expression-text diff would not
   catch it.
2. **Prefer `ALTER POLICY`** — `ALTER POLICY <name> ON <table> USING (…) WITH
   CHECK (…)` changes only the expression. It never restates the role list, the
   command, or the permissive flag, so none of those can be silently lost (e.g.
   dropping `TO authenticated` and defaulting to PUBLIC), and there is no window
   where the policy is absent. `DROP` + `CREATE` is used only where ALTER cannot
   express the change; every such case is listed explicitly in the PR, with the
   permissive flag restated in the generated DDL.
   The generator emits **only the clauses that are non-null in the snapshot for
   that policy** — never a fixed `USING (…) WITH CHECK (…)` template. Postgres
   rejects `WITH CHECK` on `FOR SELECT`/`FOR DELETE` and rejects `USING` on
   `FOR INSERT`; `FOR UPDATE`/`FOR ALL` take both. With 268 unwrapped `qual` and
   117 unwrapped `with_check`, many policies are single-clause, so a fixed
   template would fail mid-batch.
3. **Generate, don't hand-write** — a script reads the snapshot and rewrites
   `auth.uid()` occurrences that are not already inside a scalar subquery. The
   match is **case-insensitive and whitespace-tolerant**: Postgres normalises
   stored expressions, so the 9 already-wrapped ones render as
   `( SELECT auth.uid() AS uid)` — leading space, uppercase SELECT, `AS uid`
   alias. A naive "not preceded by `select `" test would double-wrap them.
   Everything else in each expression is preserved verbatim.
4. **Batch by table**, one migration per batch, run and verified in order:
   - Batch 1: `sales`, `sale_items`, `product_variants`, `products`
   - Batch 2: `customers`, `voucher_entries`, `purchase_bills`, `purchase_items`
   - Batch 3: `organization_members` (9 policies), `user_roles` (5)
   - Batch 4+: remaining tables, alphabetical, ~20 per migration
   `organization_members` / `user_roles` sit in their own batch because they are
   the tables the other policies read; a mistake there is the widest blast radius.
5. **Post-batch diff** — re-dump policies and diff against the snapshot,
   including `permissive`, `cmd`, and `roles`. The only textual difference
   permitted is `auth.uid()` → `(select auth.uid())`.

## Verification per batch

Run as a real non-admin org user (session restored in the preview), before and
after each batch:

- Row counts on 3-4 tables in the batch match exactly, pre vs post.
- A record id known to belong to another org is still unreadable.
- The mirror test: sign in as a user belonging to a *different* org entirely and
  confirm they see none of the first org's rows. This is the direction that
  catches an accidentally-permissive policy.
- One INSERT and one UPDATE succeed (catches a broken `with_check`, which shows
  up as "save failed" rather than a wrong list).
- An admin user still sees the elevated rows they saw before.

If any check fails, the batch's migration is reverted from the snapshot before
proceeding.

## Measurement

`pg_stat_user_tables.seq_scan` and `seq_tup_read` are cumulative since
`stats_reset` — they only ever increase, so a raw before/after total would look
like the fix failed even when it worked. Measure a **rate**, not a total, using
paired readings rather than `pg_stat_reset()` (a reset would also wipe the
`pg_stat_statements` history the top-5 comparison depends on):

- Two readings ~30 minutes apart **before** any change, during normal traffic →
  baseline scans-per-minute and tuples-read-per-minute for
  `organization_members` and `user_roles`.
- Two more readings ~30 minutes apart **after**, at a comparable time of day.
- `stats_reset` is recorded with every reading to confirm no reset intervened.

Also recorded, unaffected by the counter issue and compared directly:

- wall-clock for Sales Invoice Dashboard, All Time, ~1,000 rows
- `pg_stat_statements` total_exec_time / mean_exec_time for the top 5 queries

**Measure after batch 1, not only at the end.** If four tables' worth of
policies move the scan rate not at all, that is worth knowing before rewriting
the remaining 340-odd — and it validates the measurement method while the blast
radius is still small. Success is the scan *rate* falling, not the diff looking
clean.

## Explicitly out of scope

`product_variants`' 55.7M seq scans are likely nested-loop re-scans from
application queries, not policy re-evaluation. If they persist after the fix,
that is a separate investigation along with the two heavy queries
(25.87ms x 14,585 calls, 28.51ms x 5,124 calls) that need their own indexes.
No policy is disabled or simplified at any point to "test whether RLS is the cost".
