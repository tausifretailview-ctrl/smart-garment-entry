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

## How to prove (authenticated)

```powershell
# Requires a signed-in access token for an org you belong to (do not use prod
# service role in CI). Never invent sample tenants on production.
# Apply migration 20261117120000_get_customer_financial_snapshot_all.sql first.
$env:VITE_SUPABASE_URL="…"
$env:VITE_SUPABASE_PUBLISHABLE_KEY="…"
$env:SUPABASE_ACCESS_TOKEN="…"   # user JWT
$env:ORG_ID="…"                  # large org preferred
$env:ORG_ID_2="…"                # optional second org
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
