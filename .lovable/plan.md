# Health check — 13 Sep 2026 (read-only, no changes applied)

## URGENT — Part 4: automatic backups are still dead

Confirmed from the scheduler's own run history:

- All three nightly dispatch jobs (17:30, 18:00, 02:30 UTC) **fail every single run** with:
  `app.supabase_url / app.supabase_anon_key are not configured` — raised inside `dispatch_nightly_backups()`.
- 15 consecutive failures each, from 29 Aug (earliest retained run history) through 13 Sep 02:30 UTC. Zero successes.
- `backup_logs` holds 65 rows, newest **12 Aug 2026 17:30 UTC**. No automatic or manual backup has been recorded for any organization in over a month.
- So the answer to "did the cron trigger ever get the secret?" is **no** — it never reaches the backup function at all; it dies in the database before the HTTP call.
- `mark-stale-backups` (hourly) **is** healthy — succeeded every hour, most recently 17:15 UTC today. Retention purge job also active. They are cleaning up a pipeline that produces nothing.

Severity: critical, live data-safety gap. Every tenant has been without automatic backups for ~4 weeks.
Fix is a config/migration change to `dispatch_nightly_backups()` — not applied in this pass.

---

## Part 1 — Fresh baseline

`pg_stat_statements` reset: **11 Jul 2026** (not reset since; numbers are cumulative over ~9 weeks).

Top DB time consumers (authenticated role):

| Statement | Calls | Mean | Total |
|---|---|---|---|
| `get_customer_financial_snapshot_batch` (variant A) | 586,635 | 887 ms | 520,315 s |
| `get_customer_financial_snapshot_batch` (variant B) | 1,499,201 | 134 ms | 200,645 s |
| `sale_items` text search by sale_id list | 181,080 | 38 ms | 6,817 s |
| `sale_items` qty/mrp by sale_id list | 49,401 | 112 ms | 5,535 s |
| `get_invoice_dashboard_stats` | 96,775 | 454 ms | 43,936 s |
| `products` multi-column ilike search | 56,570 | 48 ms | 2,738 s |
| `get_customer_financial_snapshot` (single) | 10,142 | 590 ms | 5,979 s |
| `reconcile_customer_balances` | 1,243 | 3,436 ms | 4,271 s |
| `get_pos_dashboard_stats` | 196,054 | **12.7 ms** | 2,489 s |

**Ranking has not changed.** `get_customer_financial_snapshot_batch` is still the dominant consumer — now ~72% of top-20 time across two plan variants, versus ~78% on 17 Aug. Same problem, same shape.

**Phase 1a RPC is still unwired.** `get_customer_financial_snapshot_all` exists and `fetchOrganizationFinancialSnapshotMap()` wraps it in `src/utils/customerFinancialSnapshot.ts`, but that function has **zero call sites** anywhere in `src/`. Its 71 recorded executions are all manual SQL-editor runs by `postgres`. Phase 1c is genuinely still not done.

**57014 (statement timeouts), last 7 days:** only **11**, all `purchase_bill_save`, all `authenticated` (user traffic, not backend jobs), most recent 13 Sep 15:34 UTC. No timeout entries at all in Postgres logs for the window. This is no longer a systemic problem — it is the known large-purchase-bill save path.

**Cache hit ratio: 100.00%** (179.3bn hits vs 4.56m reads). **Connections: 46 of 90** in use, 2 active, 0 idle-in-transaction. Deadlocks 0. Both healthy; neither is a bottleneck.

---

## Part 2 — "usage went up after POS got faster"

1. `get_pos_dashboard_stats` now runs at **12.7 ms mean over 196,054 calls**. Its slow twin path is gone. That is the confirmation you were after: **mean latency collapsed and call count rose** — the extra cloud usage is people using a fast screen more, not new bloat. Nothing regressed.
2. **SM HAIR composite indexes on `sales`:** the near-zero-benefit one is gone and staying gone — no unused composite remains. Current lowest scans on `sales` are `idx_sales_einvoice_status` (2) and `idx_sales_credit_note` (3), both ~696 kB and pre-existing, plus `idx_sales_trgm_salesman` (18 scans, 2 MB). The Aug cleanup held; all 8 dropped indexes have not returned.
3. **Lovable Cloud "Database server" is instance-hours, not usage-metered.** It bills the compute size you are on, per hour, regardless of query volume. Disk size is a separate fixed line. So query tuning **does not lower that bill** — it buys headroom so you can stay on the current instance size instead of having to size up. The parts of the bill that do move with usage are egress/API volume and edge function invocations.

---

## Part 3 — Named queries

1. **`get_invoice_dashboard_stats` vs `get_pos_dashboard_stats`:** gap is now **454 ms vs 12.7 ms — 36x**, wider than the 27x recorded in Aug. Volume is real: 96,775 calls, 43,936 s total, the third-largest consumer in the database. **A fix is still warranted** and this is the best value-per-effort item after the snapshot RPC.
2. **`reconcile_customer_balances`:** 1,243 calls, **3,436 ms mean**, 4,271 s total, called by `authenticated` (PostgREST) — still client-driven, not cron. Call volume is modest and has not exploded. Confirmed callers: `CustomerReconciliation.tsx`, `organizationReceivables.ts`, and as a fallback inside `customerPaymentPickerList.ts` and `salesmanCustomerList.ts` — so every Customer Payment / FloatingPayments open can hit a 3.4-second call when the primary path fails. Medium severity: low volume, bad per-call experience.
3. **`audit_logs`: 138 MB, 56,685 rows, oldest entry 10 Jul 2026.** Daily volume is ~500–1,000 rows/day, well below the ~3 MB/day figure from Aug. The archive job (`archive_audit_logs_older_than(180)`) runs daily and succeeds, but at a 180-day cutoff it has archived almost nothing (`audit_logs_archive` is 24 kB). Table size is stable, not growing dangerously — **not urgent**, but the cap is effectively not doing work yet.

---

## Part 5 — Load / bloat signals

**Bloat.** `sales` is still clean (2.4% dead, autovacuumed 12 Sep) — the Aug scale-factor fix is holding. `sale_items` 3.5%. Two tables now show the pattern `sales` had:

| Table | Live | Dead | Dead % | Last autovacuum |
|---|---|---|---|---|
| `product_variants` | 151,628 | 28,115 | **15.6%** | 9 Sep |
| `purchase_items` | 152,660 | 26,217 | **14.7%** | **21 Aug** |

`product_variants` has 1.69m updates; `purchase_items` has not been autovacuumed in 3 weeks. Both are candidates for the same per-table scale-factor treatment `sales` got. Medium severity.

**Index hygiene.** No new duplication. Near-zero-scan indexes worth reviewing (all read-heavy trigram/partial indexes, ~36 MB combined):
`idx_variants_low_stock` (8 scans, 17 MB), `idx_product_variants_barcode_trgm` (9, 9 MB), `idx_variants_color_trgm` (0, 5.3 MB), `idx_sale_items_org_size_trgm` (13, 4.9 MB), `idx_products_org_size_group_active` (0), `idx_customers_email_trgm` (0), `idx_product_variants_is_dc` (0). Low severity — space only.

**Approaching the 8s ceiling.** The five statements pinned at 7,944–8,092 ms in Aug are **gone**. Only one authenticated statement now exceeds 5 s mean: a `product_variants` select at 5,298 ms over 10 calls. The >20 s entries are all `postgres`-role manual SQL-editor analysis runs, not app traffic. This is a clear improvement.

---

## Follow-up items by severity

| # | Item | Severity |
|---|---|---|
| 1 | `dispatch_nightly_backups()` fails on missing `app.supabase_url` / `app.supabase_anon_key` — zero automatic backups since 12 Aug | **Critical** |
| 2 | `get_customer_financial_snapshot_batch` still 72% of DB time; Phase 1a set-based RPC written but wired to nothing | High |
| 3 | `get_invoice_dashboard_stats` at 454 ms × 96.8k calls, 36x its POS twin | High |
| 4 | `purchase_items` / `product_variants` at ~15% dead tuples, purchase_items unvacuumed since 21 Aug | Medium |
| 5 | `reconcile_customer_balances` at 3.4 s on payment-picker fallback paths | Medium |
| 6 | 11 × 57014 on `purchase_bill_save` in 7 days | Low |
| 7 | ~36 MB of unused trigram indexes | Low |

No fix, index change, or migration was applied. Tell me which of these to take on and I will plan it properly.
