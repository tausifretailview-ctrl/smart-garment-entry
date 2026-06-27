
## Part A — Build fixes (2 lines in `src/pages/Settings.tsx`)

1. **Line 4415** — cast settings prop:
   ```diff
   - orgSettings={settings}
   + orgSettings={settings as unknown as Record<string, unknown>}
   ```

2. **Line 49** — re-type `LazyBackupSettings` so its props propagate (mirrors the existing pattern used by `LazyInvoiceWrapper` on line 44):
   ```diff
   - const LazyBackupSettings = lazyWithRetry(() => import("@/components/BackupSettings"));
   + const LazyBackupSettings = lazyWithRetry(() => import("@/components/BackupSettings")) as unknown as React.ComponentType<
   +   React.ComponentProps<typeof import("@/components/BackupSettings").default>
   + >;
   ```

The S3 "Reduce your concurrent request rate" error from the previous build is infrastructure-side upload throttling, not a code issue — the rebuild after these TS fixes will clear it.

---

## Part B — Read-only query-time audit

For each of the **top 20 hotspots** from `pg_stat_statements`, the report will include:

| Column | Meaning |
|---|---|
| rank, calls, mean ms, total ms | from `pg_stat_statements` |
| **page(s) that trigger it** | traced from the SELECT shape back to the source file |
| **call-pattern classification** | `keystroke-driven` (calls ≫ page loads) vs `list-mount` (calls ≈ page loads) vs `per-row N+1` |
| **ILIKE on unindexed text?** | YES/NO — cross-checked against `pg_indexes` for the searched column, looking specifically for `gin_trgm_ops` |
| **GIN trigram present?** | for every ILIKE hotspot, list the existing trigram indexes on those columns (so we know whether the slowness is a missing index vs a missing debounce/cache) |

Specific deep-dive items you asked for:

- **Rank 1 — `sale_items` ILIKE on barcode / product_name / size / color filtered by `sale_id IN`**: I'll run `\d+ public.sale_items` + `pg_indexes` to confirm whether any of (`barcode`, `product_name`, `size`, `color`) have `gin_trgm_ops`, and I'll trace the call site (suspect: `src/utils/lookupBarcodeSales.ts` and the POS dashboard search in `src/utils/posDashboardSearch.ts`) to decide whether the right fix is a trigram index, a debounce, or skipping the line-item union when the query is short.
- **Rank 2 — `voucher_entries` description ILIKE × 12 OR-patterns**: same checks on `voucher_entries(description)`.
- Plus the next 18 — full table.

Client-side: walk the baseline journey (Login → POS → Sales Dashboard → Accounts → Customer Ledger → Reports → Settings) with `__ezzyCloudUsage` + `__ezzyNavPerf` to record per-route request counts and blocking waits.

### Deliverable

A single markdown report in chat with:

```
1. Top 20 server queries — full table with all flags above
2. Top 5 slow pages — wall-clock to interactive, # requests, blocking?
3. Suspected root causes per query (missing trigram / N+1 / no debounce / oversized SELECT)
4. Phase 1 fix proposal ranked by (impact ÷ risk) — for your approval
```

Also saved to `docs/phase-0-query-time-audit-2026-06-26.md`.

**No DDL, no migrations, no code edits in Part B beyond the doc file.** All Phase 1 fixes wait for your explicit approval.
