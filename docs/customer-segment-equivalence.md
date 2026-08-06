# Customer segment equivalence (Phase B #4)

Precondition from `docs/phase-3-perf-audit-2026-07.md`: before deleting the client
OFFSET walk, compare RPC vs client for a real org and post the diff.

## What exists

| Path | Source | Returns |
|------|--------|---------|
| Counts RPC | `get_customer_segment_counts` | vip/regular/risk/lost totals |
| Index RPC | `get_customer_segment_index` (migration `20261030120000_…`) | per-customer segment + stats |
| Client walk | `fetchCustomerSegmentIndexClient` | full index (legacy hot path) |

Classification rules are identical across all three (90/365 day bands, 5 orders /
₹50k VIP). Index RPC SQL is the counts CTE with a row `SELECT` instead of
`COUNT(*) FILTER`.

## How to prove (authenticated)

```bash
# Requires a signed-in access token for an org you belong to (do not use prod
# service role in CI). Never invent sample tenants on production.
$env:VITE_SUPABASE_URL="…"
$env:VITE_SUPABASE_PUBLISHABLE_KEY="…"
$env:SUPABASE_ACCESS_TOKEN="…"   # user JWT
$env:ORG_ID="…"
node scripts/prove-customer-segment-equivalence.mjs
```

Exit 0 = counts + per-customer segments match. Non-zero = **STOP** — do not
prefer either side; investigate timezone/`CURRENT_DATE` vs client `daysSince`.

## Status (this change)

- **Real-org numeric proof:** not run in this environment (no authenticated org
  credentials; production must not be seeded). **BLOCKED — pending a manual run.**
  Do not flip `fetchCustomerSegmentIndex` to the RPC until exit 0 is posted here.
- **Logical equivalence:** index RPC SQL copies the deployed counts RPC CASE rules
  (already documented as mirroring `classifyCustomerSegment`).
- **Customer Master (shipped now):**
  - Pane retention (Part 1) stops remount flash on Customer↔Supplier.
  - Chip counts use existing `get_customer_segment_counts` (non-blocking).
  - Full index still uses the client walk until proof + RPC flip.
- **`useCustomerAccountHistoryData`:** still uses `fetchCustomerSaleStats` (TODO);
  counts RPC cannot supply per-customer stats.

### Proof log

| Date | Org | Counts match? | Index mismatch count | Notes |
|------|-----|---------------|----------------------|-------|
| — | — | — | — | _awaiting authenticated run_ |

### After proof passes

1. Apply migration `20261030120000_get_customer_segment_index.sql` (Lovable/cloud).
2. Change `fetchCustomerSegmentIndex` to call `fetchCustomerSegmentIndexViaRpc`
   (optional client fallback only for deploy skew).
3. Delete or quarantine `fetchAllSalesForSegments` from UI mounts.
