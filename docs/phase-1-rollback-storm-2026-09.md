# Phase 1 — Rollback-storm measurement

**Date:** 2026-09-02  
**Scope:** Read-only. No `src/` changes, no migrations, no DDL, no `pg_stat_statements_reset()`.  
**Trigger figure:** ~**4.53 million** rolled-back transactions “since boot” (operator snapshot; **not present in this repo**).  
**Status:** **OPEN follow-up** — not resolved, not silently dropped when later performance PRs land.

This document is the gate before Phase 2 (dashboard summary RPCs). It records what we could and could not sample, classifies likely vs unlikely causes against the actual codebase, and ships a SQL editor playbook so the live counters can be pasted back.

---

## Verdict (read this first)

1. **The 4.53 M figure cannot be re-sampled from this checkout.** The committed `.env` has only the Supabase anon/publishable key. `pg_stat_database`, `pg_stat_statements`, Postgres logs, and `app_error_logs` are not reachable as anon. Production REST is up (`get_org_public_info` for slug `demo` returned 200); `app_error_logs` SELECT as anon returned `[]` (RLS); `rpc/pg_stat_statements` returned PostgREST 404 as expected.

2. **This is not explained by `ON CONFLICT` uniqueness probes in our SQL.** Postgres does **not** increment `xact_rollback` for `INSERT … ON CONFLICT DO UPDATE/NOTHING`. A repo-wide grep of `supabase/migrations` found **zero** `EXCEPTION WHEN unique_violation` handlers. Sale/POS numbering (`generate_sale_number_atomic`, `generate_pos_number_atomic`) and barcode sequence init use `ON CONFLICT`. Those paths are the *expected constraint-check pattern* the prompt asked us to rule out — and they are **not** a rollback storm.

3. **Client-side `23505` retries exist but are bounded** (typically 5–8 attempts, only on collision). They *do* produce one top-level rolled-back PostgREST transaction per failed INSERT. They cannot reach millions unless collisions themselves are millions — that would already be a visible correctness incident (duplicate bill/voucher numbers, cashiers seeing “try again”).

4. **Until the SQL editor results below are pasted in, treat 4.53 M as unclassified.** The next most likely buckets, in order, are:
   - **Cluster-wide counter, not our app schema alone.** `pg_stat_database.xact_rollback` is per *database* (`postgres` on Supabase). It includes Auth (`auth.*`), Storage, Realtime, Vault, `pg_cron`, and autovacuum/internal backends — not just PostgREST `public.*`.
   - **Top-level statement failures** that PostgREST wraps in a transaction: `57014` statement_timeout, `stock_not_negative` CHECK, insufficient-stock `RAISE`, RLS `WITH CHECK` rejects (e.g. `login_attempts` rate-limit policy), unique violations that are **not** caught with `ON CONFLICT`.
   - **PL/pgSQL `EXCEPTION` subtransactions** (caught errors). This repo uses `EXCEPTION WHEN OTHERS` mainly on cron/schedule setup and a few triggers that **re-raise**. No hot-path “try insert, catch unique, retry” loop in SQL.

5. **Phase 2–4 performance work may proceed after this document exists.** The rollback storm stays a **tracked follow-up** (`docs/phase-1-rollback-storm-2026-09.md` + `scripts/phase-1-rollback-storm.sql`). Do not close it because dashboard/search latency improved.

---

## What “4.53 million since boot” actually measures

`pg_stat_database.xact_rollback` counts **aborted transactions** (and, on many Postgres versions, **subtransaction aborts** from PL/pgSQL `EXCEPTION` blocks / `ROLLBACK TO SAVEPOINT`). It does **not** count:

| Happens | Counted as `xact_rollback`? |
|---|---|
| `INSERT … ON CONFLICT DO UPDATE/NOTHING` (conflict taken, statement succeeds) | **No** |
| Successful `COMMIT` | No (`xact_commit`) |
| Explicit `ROLLBACK` / PostgREST error abort | **Yes** (top-level) |
| Statement error in autocommit (`23505`, `23514`, `57014`, `42501`, trigger `RAISE`) | **Yes** (top-level) |
| PL/pgSQL `BEGIN … EXCEPTION WHEN … END` that **catches** an error | **Often yes** (subxact abort) — even if the outer function then succeeds |
| Autovacuum / some internal backends aborting catalog xacts | **Can be yes** (known noisy source on hosted Postgres) |

Without **`xact_commit` + window length**, 4.53 M is not interpretable:

| Window | 4.53 M rollbacks ⇒ rate |
|---|---|
| 7 days | ~7.5 / s |
| 30 days | ~1.7 / s |
| 90 days | ~0.58 / s |

A 2–5% rollback ratio on a busy REST API is often validation/`23505`/timeout noise. A 30%+ ratio, or a sustained multi-rollback-per-second **error** rate in Postgres logs, is a failure loop.

**Required first query (SQL editor / `postgres` role):** block 0 in `scripts/phase-1-rollback-storm.sql`. Paste the row into §Results below.

---

## Access attempted (2026-09-02, this agent)

| Source | Result |
|---|---|
| `.env` `VITE_SUPABASE_URL` + publishable key | Present. Production project `lkbbrqcsbhqjvsxiorvp`. |
| `GET /rest/v1/rpc/get_org_public_info` `{"p_slug":"demo"}` | **200** — backend reachable. |
| `GET /rest/v1/app_error_logs?select=id&limit=1` as anon | **200 `[]`** — RLS hides rows (expected). |
| `POST /rest/v1/rpc/pg_stat_statements` as anon | **404 PGRST202** — not an RPC (expected). |
| Service role / DB connection string / SQL editor | **Not in this environment.** Do not invent one. |
| Repo docs / plans | **No** `xact_rollback` / “4.53” / “rollback storm” string. Prior audits (`docs/phase-0-query-time-audit-2026-06-26.md`, `docs/phase-3-perf-audit-2026-07.md`, `.lovable/plan/speed-search-database-health-improvement-plan-annotated-for-2026-08-09.md`) ranked **successful** `pg_stat_statements` by total time. They never measured rollbacks. |
| `pg_stat_statements_reset()` | Last in-repo call: `supabase/migrations/20260710020103_*.sql` (2026-07-10). Phase 3 audit saw `stats_reset = 2026-07-11 20:07 UTC`. **Do not reset again** as part of this measurement. |

`app_error_logs` is the right **application** error sample once a privileged session exists. It is **not** equivalent to `xact_rollback`: `logError` (`src/lib/errorLogger.ts`) is fire-and-forget, authenticated-only, and only wired on some save/ledger paths. Timeouts that never reach a `logError` call site are invisible there.

---

## Code-side inventory (grouped by table / error type)

### A. Not a storm — `ON CONFLICT` (do not “fix”)

These succeed without aborting the transaction when the unique key already exists.

| Object | Pattern | File (latest in repo) |
|---|---|---|
| `bill_number_sequences` | `ON CONFLICT (organization_id, series) DO UPDATE last_number + 1` | `supabase/migrations/20260930120900_fix_inv_sequence_counter_ahead.sql` (`generate_sale_number_atomic`, `generate_pos_number_atomic`) |
| `barcode_sequence` | `ON CONFLICT (id) DO NOTHING` (init) | `supabase/migrations/20251115170025_*.sql` |
| `website_enquiry_rate_limits` | `ON CONFLICT (organization_id, client_ip) DO UPDATE` | `supabase/migrations/20261125120000_storefront_slug_hyphen_alias.sql` |
| Stock movement upserts | `ON CONFLICT (variant_id, bill_number)` | Several purchase-save migrations |

**Grep:** `EXCEPTION WHEN unique_violation` in `supabase/migrations` = **0 hits**.

### B. Bounded client retries — real top-level rollbacks, low expected volume

Each failed INSERT is one PostgREST transaction abort (`23505`), then a regenerate + retry. Caps are small.

| Path | Constraint / code | Max attempts | Table |
|---|---|---|---|
| `createReceiptVoucher` | `uq_voucher_entries_number_active` | 8 | `voucher_entries` |
| `createCustomerAdvance` | `uq_customer_advances_org_number` | 8 | `customer_advances` |
| `insertGeneratedProductVariant` | product/color/size/barcode unique | 1 extra insert after regenerate | `product_variants` |
| `useSaveSale` hold-number fallback | `uq_sales_org_number_active` | 8 | `sales` |
| Sale order / salesman order entry | duplicate key | 5 | order headers |
| `journalService` | `23505` detected (idempotent post) | not a tight loop | `journal_entries` |

If SQL-editor `app_error_logs` shows thousands/day of `23505` on **one** of these operations, that path graduates from “expected race” to **correctness bug** (sequence TOCTOU still losing). Investigate separately from dashboard RPCs.

### C. Trigger / CHECK `RAISE` — real failures, should be rare

| Source | SQLSTATE / message | Table |
|---|---|---|
| `product_variants.stock_not_negative` | `23514` CHECK (`stock_qty >= 0`) | `product_variants` |
| Insufficient-stock triggers | `RAISE EXCEPTION 'Insufficient stock…'` | `sale_items` insert/update |
| Purchase stock floor | `PURCHASE_STOCK_FLOOR: …` | `purchase_items` qty decrease |
| Unique active product name | `23505` on `idx_unique_active_product_name_per_org` | `products` |
| Auth-guard RPCs | `42501` Not authorized | various `SECURITY DEFINER` functions |

A loop that retried a stock-floor failure would be a **correctness** incident (oversell). Not expected at millions unless a job is wedged.

### D. Statement timeout (`57014`) — documented, not a million-loop by itself

Prior evidence (already in-repo):

- Role budgets: **authenticated 8 s**, **anon 3 s** (`docs/phase-3-perf-audit-2026-07.md`).
- ELLA NOOR `snapshot_all` / invoice dashboard stats / party-balance RPCs have timed out (`docs/snapshot-all-equivalence.md`, `supabase/migrations/20261112120000_fix_invoice_dashboard_stats_timeout.sql`).
- Purchase save: `scripts/purchase-save-57014-frequency.sql` already groups `app_error_logs` for `operation = 'purchase_bill_save'`.
- Client: `insertSaleItemsInChunks` retries a timed-out **chunk** row-by-row (each timeout = 1 rollback, then N single-row inserts). Bounded by line count, not an infinite loop.

Timeouts **do** increment `xact_rollback`. They are a performance/correctness overlap (Phase 2–4 target the slow reads). They are **not** automatically 4.53 M unless something retries a timing-out query in a tight loop without backoff. React Query does not auto-retry mutations; search retries must stay off the save/pay path (existing plan constraint).

### E. PL/pgSQL `EXCEPTION WHEN OTHERS` — not a hot write loop

Live-ish uses (latest migrations):

| Location | Behaviour | Volume class |
|---|---|---|
| Storefront enquiry / slug alias | Catch header-parse, then `ON CONFLICT` rate limit | Per public enquiry, not per POS keystroke |
| `sync_sale_payment_status_from_receipts` | `EXCEPTION WHEN OTHERS` then **`RAISE`** (flag cleanup only) | Per receipt write, only if the inner `UPDATE` actually errors |
| `sale_item_delete` | Catch then **re-raise** | Per delete, only on error |
| Nightly backup / cn-drift / `cron.unschedule` | Catch schedule setup | Once per deploy / nightly |
| Older `generate_sale_number` settings CAST | `EXCEPTION WHEN OTHERS THEN v_min_seq := 1` | **Replaced** by `generate_*_number_atomic` (no exception loop) |

The settlement trigger **creates a savepoint** on every receipt-linked `UPDATE` because the `EXCEPTION` block exists, but a savepoint that is **released** (no error) is not a rollback. Only an actual inner error increments the counter — and then it re-raises, so the outer tx also aborts.

### F. Auth / login — possible log noise, not POS

- `login_attempts_rate_ok` is STABLE and does not raise.
- RLS `WITH CHECK` on `login_attempts` INSERT rejects when the identifier exceeds 10 attempts / minute → PostgREST error → **rollback**. Bot / brute-force traffic could inflate the counter without appearing in `app_error_logs` (anon cannot `logError`).
- `AuthContext` refresh retries (`MAX_REFRESH_RETRIES = 3`) hit **GoTrue / `auth` schema**, which still lives in the same `postgres` database counter.

### G. `pg_cron` jobs

Jobs exist for backups, error-log purge, CN drift, stock alerts, balance reconciliation. Failures would be **nightly-scale**, not millions, unless a job is scheduled every few seconds and always errors. Block 5 of the SQL script lists `cron.job` / `cron.job_run_details`.

---

## How to finish the measurement (human with SQL editor)

Run **`scripts/phase-1-rollback-storm.sql` one numbered block at a time** as the `postgres` role (Supabase Dashboard → SQL). Read-only. Do not `pg_stat_statements_reset()`.

Paste outputs into §Results.

Interpretation cheat-sheet after block 0:

| Observation | Classification | Next action |
|---|---|---|
| `rollback_pct` < 5% and Postgres logs have no repeating ERROR | **Expected noise** (auth internals, rare 23505, autovacuum) | Track; do not change money/write paths |
| `rollback_pct` high **and** logs dominated by one `ERROR` / one relation | **Failure loop** | Own investigation, separate from Phases 2–4 |
| Logs dominated by `57014` on dashboard/search statements | **Same work as Phases 2–4** | Proceed; re-check rollback rate after those PRs |
| Logs dominated by `23505` on `voucher_entries` / `sales` / `product_variants` | **Correctness** (sequence TOCTOU or barcode collision) | Separate bug, do not “fix” with more retries |
| Logs empty / no ERROR but `xact_rollback` still huge | **Internal backends or subxact** | Check `backend_type` in `pg_stat_activity` history; do not rewrite POS |

Supabase Dashboard → **Logs → Postgres** (filter `errorSeverity=ERROR`) is the only place constraint names and `57014` show up with volume. `pg_stat_statements` ranks **successful** time; it will **not** by itself name the rollback storm.

---

## Baseline captures for later phases (optional, same SQL session)

While the SQL editor is open, also run the appendix blocks in the script:

- **Phase 2 before:** `EXPLAIN (ANALYZE, BUFFERS)` of `v_dashboard_stock_summary` / `v_dashboard_purchase_summary` for one org (security invoker — run as a member JWT or expect RLS to filter). Goal later: StatusBar `total_stock_qty` / due **byte-identical**.
- **Phase 5 before:** `pg_stat_user_indexes.idx_scan` for the four partial-vs-full index pairs. Do **not** drop anything in this phase.

Client call sites Phase 2 will change (cache tiers stay):

- `src/components/StatusBar.tsx` — `v_dashboard_stock_summary` (`total_stock_qty`) + `v_dashboard_receivables`
- `src/components/dashboard/StatsChartsSection.tsx` — `v_dashboard_purchase_summary` (last 7 days)

Current view definitions (verified in-repo):

- Stock: `GROUP BY pv.organization_id`, `WITH (security_invoker = true)` — `supabase/migrations/20260404193145_*.sql`
- Purchase: `GROUP BY p.organization_id, p.bill_date`, `security_invoker = true` — `supabase/migrations/20261122120000_fix_v_dashboard_purchase_summary_no_distinct.sql`

---

## Results (paste live rows here)

### Block 0 — window and ratio

```
(date, xact_commit, xact_rollback, rollback_pct, conflicts, deadlocks, stats_reset, postmaster_start, rollbacks_per_sec)
```

**Not captured in this PR** — no `postgres` role from the cloud agent.

### Block 1 — `app_error_logs` by operation / SQLSTATE (30 days)

```
(operation, error_code, n)
```

**Not captured.**

### Block 2 — `app_error_logs` 57014 / 23505 / 23514 / 42501

```
(error_code, n, sample_message)
```

**Not captured.**

### Block 3 — Postgres log ERROR histogram (Dashboard, last 24 h)

```
(sqlstate, relation/constraint, count)
```

**Not captured.**

### Block 4 — `pg_stat_statements` top writes by calls

```
(query preview, calls, mean_exec_time, rows)
```

**Not captured.** Prior *successful-query* ranking (not rollbacks): sale_items ILIKE, purchase_items barcode ILIKE, products 28-OR ILIKE, `v_dashboard_*` views — see `docs/phase-3-perf-audit-2026-07.md` and the annotated speed plan.

### Block 5 — `cron.job_run_details` recent failures

```
(jobname, status, return_message, count)
```

**Not captured.**

---

## Follow-up tracking (do not close quietly)

| ID | Item | Owner when unblocked | Blocks Phase 2? |
|---|---|---|---|
| RS-1 | Paste block 0–5 results into this doc (new commit on a later PR is fine) | Whoever has SQL editor | **No** — Phase 2 is independent read-path work |
| RS-2 | If block 3 shows a single repeating `ERROR`, open a dedicated correctness issue | — | **No**, unless it is a money/stock write loop |
| RS-3 | Re-check `xact_rollback` rate after Phases 2–4 deploy (same script, new window) | Phase 6 | No |
| RS-4 | Zero new `57014` for a week of production logs — overall programme check | After all phases | No |

---

## EXPLAIN / slow-query ranking (this phase)

No query shape changed. There is no before/after `EXPLAIN` for a rewrite.

- **Before (historical successful-query ranking):** `docs/phase-0-query-time-audit-2026-06-26.md`, `docs/phase-3-perf-audit-2026-07.md`.
- **This phase:** measurement playbook only (`scripts/phase-1-rollback-storm.sql`).
- **After:** N/A.

---

## Related

- `scripts/phase-1-rollback-storm.sql` — copy-paste measurement (this PR)
- `scripts/purchase-save-57014-frequency.sql` — purchase-save timeout slice of `app_error_logs`
- `docs/phase-3-perf-audit-2026-07.md` — 57014 handling gap + slow-query ranking
- `.lovable/plan/speed-search-database-health-improvement-plan-annotated-for-2026-08-09.md` — headline slow statements this programme targets
