# Phase 3 — Line-item search playbook results

**Date:** 2026-09-02  
**PR:** sale_items `organization_id` + `search_line_item_sale_ids` ([#582](https://github.com/tausifretailview-ctrl/smart-garment-entry/pull/582) merged to GitHub; **migration not on production**). Client hotfix [#588](https://github.com/tausifretailview-ctrl/smart-garment-entry/pull/588) routes dashboards back to the live wrappers.

**Catalog 2026-09-03 11:21** (`query-results-export-2026-09-03_11-21-32_6120.csv`): `phase3_sale_items_org_col=false`, `phase3_search_rpc=false`. Still paste `supabase/migrations/20261130120000_sale_items_org_search_rpc.sql`.

Do **not** paste this Markdown file into the SQL editor.

---

## 2026-09-02 SQL editor attempts

### 1) Dummy UUID + live wrapper → `42501 Authentication required`

`assert_org_member` inside live `search_invoice_sale_ids`. SQL editor has no JWT. Expected.

### 2) Whole playbook (including AFTER RPC) → `42883 function does not exist`

`search_line_item_sale_ids` is created by the Phase 3 migration. Merging the GitHub PR does not apply it to production Supabase.

### 3) Single-statement files — captured

| File | Export |
|---|---|
| `scripts/phase-3-before-00-ranking.sql` | `query-results-export-2026-09-03_00-25-27_c99f.csv` |
| `scripts/phase-3-before-E-invoice-join.sql` | `query-results-export-2026-09-03_00-24-35_5531.csv` |
| `scripts/phase-3-before-F-pos-exists.sql` | `query-results-export-2026-09-03_00-25-40_c968.csv` |
| `scripts/phase-3-before-0b-rpc-exists.sql` | `query-results-export-2026-09-03_00-31-56_8f13.csv` |

Org: ELLA NOOR `3fdca631-1e0c-4417-9704-421f5129ff67`. Term: `JEANS`. Window: last 30 days. Both EXPLAIN plans returned **0 rows** (no matching sales in that slice) — plans are still valid.

---

## Block 0 — `pg_stat_statements` ranking

Same `pgss_stats_reset` as the July audit (`2026-07-11 20:07 UTC`). Do **not** reset.

| Rank | Calls | Mean ms | Max ms | Total s | Shape |
|---:|---:|---:|---:|---:|---|
| 1 | 181,036 | 37.65 | 941 | **6815** | PostgREST `sale_items` barcode/name ILIKE (`pgrst_source`) |
| 2 | 17,500 | **199.94** | **7032** | **3499** | RPC `p_org_id, p_search, p_date_from, p_date_to` (live `search_invoice_sale_ids` / `search_pos_sale_ids`) |
| 3 | 28,991 | 85.63 | 1160 | 2483 | `sale_items` fetch `sale_id, quantity, mrp` |
| 4 | 13,840 | 69.07 | 1233 | 956 | `INSERT sale_items` |
| 5 | 5,557 | 97.94 | 1537 | 544 | `INSERT sale_items` (narrower column list) |
| 6 | 2,956 | 135.19 | 1748 | 400 | `sales` + nested `sale_items` |
| 7 | 12,143 | 28.09 | 510 | 341 | `sale_items` `quantity, variant_id` |
| 8 | 427 | **753.31** | 2893 | 322 | `sale_items` + `row_to_json(sales)` |

**Headline ILIKE path is unchanged** since the original plan (181,036 calls / ~38 ms / ~113 min). Production was still hitting PostgREST `sale_items` ILIKE and the live wrappers. [#588](https://github.com/tausifretailview-ctrl/smart-garment-entry/pull/588) keeps dashboards on those wrappers until the migration exists.

**Live search RPCs are already expensive:** 17.5k calls, **200 ms mean, 7.0 s max**, 58 min total. That is the wrapper body Phase 3 replaces (invoice JOIN / POS EXISTS). Org-scoped GIN is aimed at this row as much as at the 181k PostgREST ILIKE.

---

## Block E — live invoice JOIN (BEFORE)

`JEANS` / last 30 days / ELLA NOOR. **8.061 ms**, 0 rows, 2,786 shared hits.

```
Limit
  -> Nested Loop
       -> Index Scan using idx_sales_org_type_date_active on sales s
            Index Cond: org + sale_type='invoice' + last 30 days
            actual rows=565
       -> Index Scan using idx_sale_items_saleid on sale_items si
            Index Cond: (sale_id = s.id)
            Filter: deleted_at IS NULL AND product_name ~~* '%JEANS%'
            loops=565
```

**Phase 3 premise confirmed.** Planner drives from `sales` then `idx_sale_items_saleid`; `ILIKE` is a **residual filter**. Unscoped trigram `idx_sale_items_trgm_product_name` is **not used**. Matches Appendix B: `idx_sale_items_saleid` has 166 M scans.

565 invoice headers in 30 days for this org is a small slice — 8 ms here. The 200 ms / 7 s RPC means (row 2) is the same shape on hotter orgs / broader dates / all 7 UNION branches.

---

## Block F — live POS EXISTS (BEFORE)

`JEANS` / last 30 days / ELLA NOOR. **9.853 ms**, 0 rows, 1,107 shared hits.

```
Limit
  -> Hash Semi Join  (s.id = si.sale_id)
       -> Bitmap Heap Scan on sales s
            Bitmap Index Scan on idx_sales_org_type_date_active
            actual rows=11  (pos + delivery_challan, 30 days)
       -> Hash
            -> Bitmap Heap Scan on sale_items si
                 Recheck: product_name ~~* '%JEANS%' AND deleted_at IS NULL
                 Bitmap Index Scan on idx_sale_items_trgm_product_name
                 actual rows=1088
```

Trigram **does** fire on the EXISTS inner scan, but it is **cluster-wide**: 1,088 `%JEANS%` line items hashed, then semi-joined to **11** local POS/DC sales → 0 rows. That is why `si.organization_id = p_org_id` plus org-scoped GIN matters — the 1,088 hits are not tenant-filtered.

---

## Block 0b — which search RPCs exist on production

Captured 2026-09-02 ~18:31 UTC. Export: `query-results-export-2026-09-03_00-31-56_8f13.csv`.

| `proname` | Args |
|---|---|
| `search_invoice_sale_ids` | `p_org_id uuid, p_search text, p_date_from date, p_date_to date, p_limit integer` |
| `search_pos_sale_ids` | same |

**`search_line_item_sale_ids` is absent.** That is the Invoice Dashboard toast:

> Could not find the function public.search_line_item_sale_ids(...) in the schema cache

[#588](https://github.com/tausifretailview-ctrl/smart-garment-entry/pull/588) switched dashboards back to the two wrappers above. Do **not** run `scripts/phase-3-after-*.sql` until this catalog grows a third row.

---

## What this means for the migration

| Live shape | What Phase 3 changes |
|---|---|
| Invoice: nested loop `sales` → `idx_sale_items_saleid`, ILIKE residual | `si.organization_id = p_org_id` so org+trigram GIN can drive |
| POS: unscoped trigram (1,088 rows) hash-semi-joined to 11 sales | Same org predicate; JOIN from `sale_items` like invoice |
| RPC wrappers 200 ms mean / 7 s max | Same 7 UNION branches, org-scoped |
| PostgREST 181k ILIKE | Drops after web deploy of the wrapper client ([#588](https://github.com/tausifretailview-ctrl/smart-garment-entry/pull/588) already avoids the missing shared RPC). Org-scoped body still needs the **migration on production**. |

**Do not run** `scripts/phase-3-after-*.sql` until `search_line_item_sale_ids` exists on the live project (re-check with `scripts/phase-3-before-0b-rpc-exists.sql`).

After migrate, re-run E vs G on the same org/term/window and expect Bitmap/GIN on `idx_sale_items_org_*_trgm` instead of `idx_sale_items_saleid` residual ILIKE.

---

## Related

- `scripts/phase-3-before-0b-rpc-exists.sql`
- `scripts/phase-3-before-E-invoice-join.sql`
- `scripts/phase-3-before-F-pos-exists.sql`
- `docs/phase-1-rollback-storm-2026-09.md` Appendix B — keep `idx_sale_items_sale` and `idx_sale_items_saleid`
