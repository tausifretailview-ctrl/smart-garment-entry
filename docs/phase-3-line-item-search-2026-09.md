# Phase 3 — Line-item search playbook results

**Date:** 2026-09-02  
**PR:** sale_items `organization_id` + `search_line_item_sale_ids`

Do **not** paste this Markdown file into the SQL editor. Open a `scripts/phase-3-before-*.sql` file.

---

## 2026-09-02 SQL editor attempts

### 1) Dummy UUID + live wrapper → `42501 Authentication required`

`assert_org_member` inside live `search_invoice_sale_ids`. SQL editor has no JWT. Expected. Not a Phase 3 defect.

### 2) Whole playbook (including AFTER RPC) → `42883 function does not exist`

```
ERROR: 42883: function public.search_line_item_sale_ids(uuid, unknown, date, date, integer, text[]) does not exist
LINE 122: SELECT * FROM public.search_line_item_sale_ids(
```

Expected. That RPC is created by this PR’s migration. It is **not on production**. The SQL editor ran the whole buffer, so it hit AFTER block C (line 122) even though the visible cursor was on AFTER block G (`si.organization_id`). Block G would have failed next with `42703 column si.organization_id does not exist`.

Ranking / body-only EXPLAIN still not captured because they were in the same buffer.

---

## What to run now (one file per Run)

Each file is a **single statement**. Paste the entire file. Do not open `phase-3-line-item-search-explain.sql` (that index file now raises on purpose).

**Before migrate (do these three, in order):**

1. `scripts/phase-3-before-00-ranking.sql` — `pg_stat_statements`. No JWT. Export CSV.
2. `scripts/phase-3-before-E-invoice-join.sql` — live invoice JOIN EXPLAIN. Copy the QUERY PLAN.
3. `scripts/phase-3-before-F-pos-exists.sql` — live POS EXISTS EXPLAIN. Copy the QUERY PLAN.

Optional: `scripts/phase-3-before-0b-rpc-exists.sql` — confirm `search_line_item_sale_ids` is absent (0 rows for that name).

**After migrate only:** `scripts/phase-3-after-C-shared-rpc.sql` and `scripts/phase-3-after-G-org-column.sql`.

---

## Results (paste live rows here)

### Block 0 — `pg_stat_statements` ranking

```
(query_preview, calls, mean_ms, max_ms, total_s)
```

**Not captured** — aborted by 42501 then 42883 in the same buffer.

### Block E — invoice JOIN EXPLAIN

**Not captured.**

### Block F — POS EXISTS EXPLAIN

**Not captured.**

### After-migrate C / G

**Do not run yet.** 42883 on 2026-09-02 confirms the RPC is not deployed.

---

## Related

- `scripts/phase-3-before-00-ranking.sql`
- `scripts/phase-3-before-E-invoice-join.sql`
- `scripts/phase-3-before-F-pos-exists.sql`
- `scripts/invoice-dashboard-search-invoice-sale-ids-verify.sql` — AUTH 0c if you later want wrapper EXPLAIN
- `docs/phase-1-rollback-storm-2026-09.md` Appendix B — both `idx_sale_items_sale` and `idx_sale_items_saleid` are hot
