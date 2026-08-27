# Customer financial snapshot_all equivalence (Phase 1)

Precondition: before switching whole-org callers off
`get_customer_financial_snapshot_batch`, prove the set-based
`get_customer_financial_snapshot_all` matches batch field-for-field on real orgs.

## What exists

| Path | Source | Returns |
|------|--------|---------|
| Single | `get_customer_financial_snapshot` | outstanding_dr, advance, CN |
| Batch (FOREACH) | `get_customer_financial_snapshot_batch` | same + `customer_id`, chunks of 10 |
| Set-based (new) | `get_customer_financial_snapshot_all` | same columns, one row per active customer |

`outstanding_dr` is inlined from the same components as
`reconcile_customer_balance` / `get_customer_true_outstanding` (migration
`20260817120000`). Advance matches `_customer_advance_available`. CN matches
`_customer_cn_available_total`. No `FOREACH`, no per-customer RPC inside.

## How to prove

### Option A — Supabase SQL editor (preferred when no user JWT)

Use `scripts/prove-snapshot-all-equivalence-timed.sql` — **one block at a time**:

| Step | What | SQL editor? |
|------|------|-------------|
| DIAG | `auth.uid()` / role | yes |
| 0 | `SET statement_timeout = '120s'` | yes |
| 1 | `snapshot_all` row count + `elapsed_ms` NOTICE | yes |
| 2 | `EXPLAIN (ANALYZE)` on `snapshot_all` only | yes |
| 3 | `snapshot_all` vs `get_customer_party_balances` | yes — expect `diff_rows = 0` |
| 3b | CN pool vs `_customer_cn_available_total` | yes (slower) |
| 4 | vs `get_customer_financial_snapshot` per row | **no** — `42501 Authentication required` |

**Common mistake:** running Step 2 together with old Step 3 (or the whole file).
The error stack mentions `get_customer_financial_snapshot` / `assert_org_member` —
that is Step 4, not Step 2. Highlight **only** the `EXPLAIN` block for Step 2.

Legacy `scripts/prove-snapshot-all-equivalence.sql` SECTION A still calls per-customer
snapshot and fails in the editor the same way — use Step 3/3b here instead, or Node
(Option B) for batch-path equivalence.

### Option B — Node script (authenticated user JWT)

```powershell
# Requires a signed-in access token for an org you belong to (do not use prod
# service role in CI). Never invent sample tenants on production.
# IMPORTANT: SUPABASE_ACCESS_TOKEN must be the Supabase Auth session access_token
# (user JWT after EzzyERP login), NOT the Supabase account Personal Access Token
# from supabase.com/dashboard/account/tokens (Management API only — RPCs will 401).
# Apply migration 20261117120000_get_customer_financial_snapshot_all.sql first.
$env:VITE_SUPABASE_URL="…"
$env:VITE_SUPABASE_PUBLISHABLE_KEY="…"
$env:SUPABASE_ACCESS_TOKEN="…"   # user session JWT
$env:ORG_ID="…"                  # ELLA NOOR: 3fdca631-1e0c-4417-9704-421f5129ff67
$env:ORG_ID_2="…"                # org with pre-29-May CustomerReceipt vocabulary
$env:ORG_ID_3="…"                # org with legacy_paid_baseline history
# Or: $env:ORG_IDS="uuid1,uuid2,uuid3"
node scripts/prove-snapshot-all-equivalence.mjs
```

Exit 0 = every field for every financial-activity customer matches. Non-zero =
**STOP** — do not switch callers.

## Status (this change)

- **Step 0 (`pg_stat_statements_info.stats_reset`):** **BLOCKED (2026-08-17).**
  No service-role / SQL editor access from this agent environment. Call window
  for the reported 1,313,843 batch invocations is therefore unknown (could be
  days or weeks). Whole-org fan-out remains the correct *structural* target;
  cannot confirm share of mass until reset timestamp is known.
- **Phase 1a:** migration
  `supabase/migrations/20261117120000_get_customer_financial_snapshot_all.sql`
  added. Existing snapshot / batch functions **unchanged**.
- **Real-org numeric proof:** **BLOCKED (2026-08-17).** Same gate as
  `docs/customer-segment-equivalence.md` — agent run would exit 2:
  `SUPABASE_ACCESS_TOKEN` and `ORG_ID` are not in the environment (URL/anon key
  are in `.env`). Production must not be seeded; do not invent a tenant.
- **Phase 1c (caller swap):** **NOT DONE.** Prompt forbids switching callers on
  an unproven function. After exit 0 on ≥2 orgs (one large), wire
  `fetchOrganizationSnapshotAll` into:
  - `MobileOwnerBalanceReports.tsx`
  - `SalesmanOutstanding.tsx`
  - `CustomerBalanceAdjustmentDialog.tsx`
  - `fetchOrganizationCustomerAccountTotals`
  Leave POS / Sales Invoice / command palette / `SalesmanOrderEntry` on batch.

### Proof log

| Date | Org | Active customers | Diffs | Batch ms | All ms | Notes |
|------|-----|------------------|-------|----------|--------|-------|
| 2026-08-17 | — | — | — | — | — | Exit 2 — no `SUPABASE_ACCESS_TOKEN` / `ORG_ID` |
| 2026-08-27 | ELLA NOOR `3fdca631…` | 1115 | — (incomplete) | 213683 (chunk 10) | **8134 → timeout** | Authenticated JWT. `snapshot_all` hits **8s statement_timeout** every run (~8147ms). Batch chunk 50 also times out on first call. |
| 2026-08-27 | ELLA NOOR `3fdca631…` | **2377** | **113 outstanding** | — | **22047** (postgres) | Lovable SQL editor. DIAG: postgres, no JWT. Step 3 party vs `snapshot_all`: **113** `outstanding_mismatches`, max delta **₹61,900**, advance **0** drift. Step 3b CN: **0** drift. **STOP — do not cut over.** |

### Step 3-detail drift analysis (ELLA NOOR, top cases)

| Customer | Party signed | Snapshot signed | Drift |
|----------|-------------|-----------------|-------|
| SHUMAMA BAIRELI | ₹1,58,700 Dr | ₹96,800 Dr | +₹61,900 |
| Sharmin Mewara | ₹0 | ₹24,750 Cr | +₹24,750 |
| Naseem Jahid | ₹2,350 Cr | ₹18,850 Cr | +₹16,500 |
| Shubhangi | ₹8,600 Cr | ₹0 | −₹8,600 |
| Siya Kapoor | ₹60,850 Dr | ₹66,650 Dr | −₹5,800 |

**Patterns in the 113 rows:**

1. **Party = ₹0, snapshot = credit** — many rows (e.g. Sharmin, AMNA DARVESH). Snapshot counts return/credit components party treats differently.
2. **Party = credit, snapshot = ₹0** — e.g. Shubhangi, Moin, AKILA (party shows Cr, snapshot settled).
3. **Both Dr but large gap** — SHUMAMA (+₹61,900) is the worst; known advance/CN edge-case name in prior audits.

**Likely root cause (repo migration gap):** `get_customer_financial_snapshot_all`
(`20261117120000`) predates the party SSOT fix (`20261126120000_fix_party_balances_settlement_memo_helper.sql`). Snapshot still uses:

- Old receipt exclusions (LIKE list) instead of `_is_settlement_memo_receipt`
- `pending_sale_returns` with `credit_status = 'pending'` only, not `_sale_return_remaining_credit_for_balance`

Party RPC is canonical for UI; snapshot_all must be rewritten to match `_get_customer_party_balances_rows` body before cutover.

**Next engineering step:** new migration aligning `snapshot_all` CTEs to `20261126` party body (not a client-side workaround).

### ELLA NOOR authenticated chunk benchmark (2026-08-27)

| Chunk size | RPC calls | Total ms | Max chunk ms | Under 8s? |
|------------|-----------|----------|--------------|-----------|
| 10 (today) | 112 | 213,683 | 2,536 | yes |
| 15 | 75 | 203,546 | 3,578 | yes |
| 20 | 56 | 202,230 | 4,724 | yes |
| 25 | 45 | 200,394 | 6,227 | yes |
| 30 | 38 | 196,827 | 6,803 | yes |
| 50 | — | 8,353 (fail) | — | **no** |

**Recommendation until SQL editor confirms `snapshot_all` correctness:** do **not** cut over whole-org callers to a single client `snapshot_all` call for large orgs. Prefer **batch chunk size 20–25** (max ~4.7–6.2s, ~45–56 RPCs vs 112 today) or paginate customer IDs client-side once equivalence is proven. Chunk **≥50** exceeds authenticated timeout on ELLA NOOR.

Cloud Agent cannot run Lovable SQL editor directly (no `SUPABASE_SERVICE_ROLE_KEY` / `DATABASE_URL`). Use `scripts/prove-snapshot-all-equivalence-timed.sql` for postgres-role timing + EXPLAIN + diff_rows.

### After proof passes

1. Apply migration on cloud (Lovable) if not already.
2. Add `fetchOrganizationSnapshotAll` in `customerFinancialSnapshot.ts`.
3. Point the four whole-org callers at it.
4. Re-check `pg_stat_statements`: batch call count down; `…_snapshot_all` ≈ report opens.
