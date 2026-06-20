# Money-path test suite

Automated tests for payment, balance, stock, and import mapping — the safety net before money-path refactors.

## Quick start (unit tests — no database)

```bash
npm run test:money
```

Runs pure logic tests (settlement tolerance, Shumama balance, Excel PRate/SRate/MRP mapping, drift detection). **No Supabase credentials required.**

---

## Staging Supabase setup (Step 1)

Integration tests and the hand-crafted seed **must not** run against production. Use a **separate** Supabase project (staging/test) or local `supabase start`.

### A. Create a staging project (hosted)

1. In [Supabase Dashboard](https://supabase.com/dashboard) → **New project** (e.g. `smart-garment-staging`).
2. Note the **Project URL** and **service_role** key (Settings → API). Store only in `.env.test` — never commit.
3. Install [Supabase CLI](https://supabase.com/docs/guides/cli) if needed.

### B. Apply migrations to staging

From this repo root, link the staging project and push migrations:

```bash
# One-time link (use staging project ref, NOT production)
supabase link --project-ref YOUR_STAGING_PROJECT_REF

# Apply all supabase/migrations/* in order
supabase db push
```

**If any migration fails on a clean project, stop and report the filename + error.** That indicates migration history is not reproducible — do not work around silently.

Alternative (local Docker):

```bash
supabase start
supabase db reset   # applies migrations + local seed if configured
```

### C. Verify schema

```bash
cp .env.test.example .env.test
# Edit .env.test with staging URL + service_role key

npm run test:verify-staging
```

Confirms these money-path tables exist and are queryable: `sales`, `sale_items`, `purchase_bills`, `purchase_items`, `product_variants`, `customers`, `voucher_entries`, `customer_advances`, `sale_returns`.

---

## Wire credentials (Step 3)

1. Copy `.env.test.example` → `.env.test` (gitignored).
2. Set **only** staging values:
   - `SUPABASE_TEST_URL`
   - `SUPABASE_TEST_SERVICE_ROLE_KEY`
3. Vitest loads `.env.test` automatically via `test/setup/vitest.setup.ts`.
4. **Production fallbacks removed** — `SUPABASE_TEST_*` is required; `VITE_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are not used for tests.

Optional: `SUPABASE_TEST_ORG_ID` reuses one org for ephemeral per-run fixtures (integration tests create + delete their own rows).

---

## Hand-crafted seed (Step 2)

Deterministic, re-seedable money scenarios for staging / atomic-refactor prep:

```bash
npm run test:seed
```

Creates (or re-creates) two orgs by fixed slug:

| Slug | Purpose |
|------|---------|
| `money-staging-org-a` | Full money scenarios |
| `money-staging-org-b` | Cross-tenant isolation (minimal customer) |

**Org A scenarios (fake data only):**

| Entity | Scenario |
|--------|----------|
| Customer | Plain (no special balance) |
| Customer | Unused advance (₹6,000 active — tests unused-pool logic) |
| Customer | Partial-paid invoice (₹1,000 net / ₹400 paid) |
| Customer | Sale with linked return + `sale_return_adjust` |
| Sales | Fully paid, partial, soft-cancelled, return-adjusted |
| Purchase | Multi-line bill with MRP on each row |
| Advances | Fully used, partially used, unused |

Re-run is idempotent: purges money data for both orgs, keeps org rows, re-inserts scenarios.

Helpers: `test/helpers/moneyTestSeedScenarios.ts` (`seedMoneyTestScenarios`, `verifyOrgIsolation`).

---

## Integration tests

```bash
npm run test:integration
```

Runs only when `.env.test` (or shell env) provides `SUPABASE_TEST_*`. Otherwise suites are **skipped** (not failed).

Covered flows:

| Flow | File |
|------|------|
| POS ring bill + stock decrement | `sales.money.integration.test.ts` |
| Partial payment persistence | `sales.money.integration.test.ts` |
| Soft delete restores stock once | `sales.money.integration.test.ts` |
| Concurrent POS numbers | `sales.money.integration.test.ts` |
| Purchase → stock + MRP | `purchase.money.integration.test.ts` |
| Advance FIFO + ledger balance | `customerAdvance.money.integration.test.ts` |

Ephemeral fixtures: each suite calls `seedMoneyTestFixtures` in `beforeAll` and cleans up in `afterAll`.

---

## What is covered

| Area | Unit | Integration |
|------|------|-------------|
| POS settlement / partial / ₹1 tolerance | ✅ | ✅ |
| Sale cancel + stock restore once | — | ✅ |
| Concurrent POS numbers | — | ✅ |
| Shumama advance double-count | ✅ | — |
| Advance FIFO application | ✅ | ✅ |
| Net receivable formula | ✅ | — |
| Purchase stock + MRP on line | — | ✅ |
| Excel PRate/SRate/MRP mapping | ✅ | — |
| Completed-but-underpaid drift | ✅ | — |

## CI follow-up (not wired yet)

Add a GitHub Actions job with staging secrets:

```yaml
- run: npm ci
- run: npm run test:money
- run: npm run test:verify-staging
- run: npm run test:seed
- run: npm run test:integration
```

Block merges on `test:money` first; add integration once staging secrets are in CI.

## Rules

- **Tests only** — failures report live bugs; fix in a separate task.
- Assert **specific numbers**, not just “no throw”.
- **Never** point test config at production.
- Existing tests under `src/**/*.test.ts` are included in `npm test`.
