# Application Health Audit (Speed, Loading, Cloud Usage) — 2026-08

Deliverable: one read-only report at `docs/app-health-audit-2026-08.md`. No code changes in this phase.

## One correction to the brief before we start

The brief's headline assumption — "AppSidebar has zero hover or touch prefetch" — does not match the code. `src/components/AppSidebar.tsx` renders every item through `src/components/NavLink.tsx`, and that component already fires `prefetchTabPage(path)` on `mouseenter`/`focus` and `prefetchTabPage(path, { intent: true })` on `pointerdown`/`touchstart`. `docs/web-nav-loading-implementation-2026-08.md` records this as landed in PR #225 ("Core shell + sidebar NavLink intent prefetch landed earlier").

So the sidebar-only routes (Settings, User Rights) are prefetched on hover/touch, and the confirmed field case must have another cause. The audit's first job is to find that cause instead of re-shipping a fix that already exists. Candidates to test: prefetch fires but the chunk request itself fails or stalls (deployment skew / MIME error path already seen in `chunkLoadRetry.ts`), touch users tapping straight through with no dwell time, or the timeout being driven by data fetch rather than chunk load.

## Evidence already gathered (goes into the report)

- Top DB query by total time: the `sale_items` ILIKE search — **167,990 calls, 38.65 ms mean, 6,493 s total**. It is ~10x the next query by total time and is the dominant cost item in both latency and call volume.
- Next tier: `purchase_items` + `purchase_bills` lateral join (5,137 calls, 118 ms mean), `sales` 4-column ILIKE (6,972 calls, 81 ms mean), `v_dashboard_purchase_summary` (4,605 calls, 110 ms mean, 2.97 s max).
- Database size: **1052 MB total, 1018 MB in public tables**. Largest: `stock_movements` 213 MB, `product_variants` 140 MB, `audit_logs` 138 MB, `purchase_items` 115 MB, `sales` 84 MB, `sale_items` 67 MB.
- Sequential-scan red flags: `product_variants` 55.7M seq scans and `sale_items` 6.85M seq scans — both large tables being scanned rather than indexed on some call path.
- 72 files under `src/pages` still use a bare `animate-spin` loader; 48 files use `.range(` pagination.

## What the audit will still do

1. **Speed / loading**
   - Trace the actual path from a sidebar tap on Settings/User Rights: confirm the prefetch call fires, whether the chunk resolves, and whether the 8 s soft hint and hard timeout in `TabCachedPages.tsx` are triggered by chunk load or by the page's own data queries.
   - Enumerate every nav surface and list any route reachable only through a surface without prefetch (verified per-file, not assumed).
   - Re-run the `window.__ezzyNavPerf` harness if it still functions in this environment; if authenticated timing is unavailable here (as it was in the prior pass), say so plainly rather than reporting modelled numbers as measured.
2. **General triage** — classify each finding as cold-chunk / slow-query / render cost, and separately assess whether the bare-spinner pages and the `.range(` loops sit on user-facing load paths or background/report paths.
3. **Cloud usage** — extend the numbers above with per-query call-count ranking, growth rate on the largest tables, edge-function invocation counts, storage, and any over-fetching (full-row selects feeding screens that render a few columns). Flag anything trending to a limit.
4. **Ranking** — three separate lists: confirmed user pain, cost savings, unreported/theoretical. Each item states its §2 category and how it was measured.

## Technical notes

Read-only throughout: `pg_stat_statements` via the slow-query tool, `pg_class`/`pg_stat_user_tables` for size and scan counts, `supabase--analytics_query` for edge-function invocation volume, ripgrep over `src/` for call-shape patterns. Fixes are proposed in the report only and built later, one at a time with a build + regression check after each.
