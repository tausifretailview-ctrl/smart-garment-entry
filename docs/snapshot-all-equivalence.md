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

Paste `scripts/prove-snapshot-all-equivalence.sql` (SECTION A). Set `org_id` to a
**large** org, run, then repeat for a second org. Expect `diff_rows = 0` both
times. If `diff_rows > 0`, uncomment SECTION B and export the mismatch CSV.

Compares `get_customer_financial_snapshot_all` to
`get_customer_financial_snapshot` per active customer (same numbers as the
batch FOREACH path). Tolerances: 0.01 on money fields.

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

### After proof passes

1. Apply migration on cloud (Lovable) if not already.
2. Add `fetchOrganizationSnapshotAll` in `customerFinancialSnapshot.ts`.
3. Point the four whole-org callers at it.
4. Re-check `pg_stat_statements`: batch call count down; `…_snapshot_all` ≈ report opens.
