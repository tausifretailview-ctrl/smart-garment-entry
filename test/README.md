# Money-path test suite

Automated tests for payment, balance, stock, and import mapping — the safety net before money-path refactors.

## Quick start (unit tests — no database)

```bash
npm run test:money
```

Runs pure logic tests (settlement tolerance, Shumama balance, Excel PRate/SRate/MRP mapping, drift detection). **No Supabase credentials required.**

## Integration tests (disposable test DB)

Integration tests **must not** run against production. Use:

- `supabase start` (local), or
- A dedicated Supabase **test/staging** project

1. Copy `.env.test.example` → `.env.test` (or export variables in your shell).
2. Apply migrations to the test project: `supabase db push` (or your CI migration step).
3. Run:

```bash
# PowerShell
$env:SUPABASE_TEST_URL="http://127.0.0.1:54321"
$env:SUPABASE_TEST_SERVICE_ROLE_KEY="your-service-role-key"
npm run test:integration

# Or all tests (integration skipped automatically if env missing)
npm run test
```

Optional: set `SUPABASE_TEST_ORG_ID` to reuse a fixed org instead of creating one per run.

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

Add a GitHub Actions job:

```yaml
- run: npm ci
- run: npm run test:money          # always
- run: npm run test:integration   # with SUPABASE_TEST_* secrets on a staging project
```

Block merges on `test:money` first; add integration once a hosted test Supabase project is provisioned.

## Rules

- **Tests only** — failures report live bugs; fix in a separate task.
- Assert **specific numbers**, not just “no throw”.
- Existing tests under `src/**/*.test.ts` are included in `npm test`.
