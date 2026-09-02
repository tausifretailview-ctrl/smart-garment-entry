# Phase 3 — Line-item search playbook results

**Date:** 2026-09-02  
**PR:** sale_items `organization_id` + `search_line_item_sale_ids`  
**Playbook:** `scripts/phase-3-line-item-search-explain.sql`

---

## 2026-09-02 SQL editor attempt

The identity + ranking batch was pasted as **one script** against production.

```sql
SELECT public.search_invoice_sale_ids(
  '00000000-0000-0000-0000-000000000000', 'JEANS', …);
SELECT public.search_line_item_sale_ids(
  '00000000-0000-0000-0000-000000000000', 'JEANS', …, ARRAY['invoice']);
-- then pg_stat_statements ranking
```

**Result:** `ERROR 42501: Authentication required`  
**Context:** `assert_org_member(uuid)` line 4 ← `search_invoice_sale_ids` line 7 (`SELECT public.assert_org_member(p_org_id)`).

This is **expected**. It is not a Phase 3 defect.

| Cause | Why it failed |
|---|---|
| SQL editor has no JWT | `auth.uid()` is NULL → `assert_org_member` raises 42501 |
| Dummy org UUID | Even with a JWT, `00000000-…` is not a membership |
| `search_line_item_sale_ids` | **Not on production yet** (this PR’s migration) |
| Combined batch | The 42501 aborted the script, so `pg_stat_statements` ranking never ran |

Live wrappers still use `assert_org_member`. The new shared RPC uses the fail-closed `auth.role()` two-`IF` guard (same as Phase 2). Both reject an unauthenticated SQL-editor session.

---

## What to run next (one block at a time)

Playbook is rewritten to match `scripts/invoice-dashboard-search-invoice-sale-ids-verify.sql`:

1. **Block 0** — `pg_stat_statements` ranking. No JWT. Run this alone; paste the 20 rows here.
2. **Block 0b** — does `search_line_item_sale_ids` exist? Expect 0 rows until migrate.
3. **Blocks E–F** — body-only `EXPLAIN (ANALYZE, BUFFERS)` of the live invoice JOIN and POS EXISTS shapes (ELLA NOOR `3fdca631-1e0c-4417-9704-421f5129ff67`, term `JEANS`, last 30 days). No RPC, no auth.
4. **Block 0c** then **A–B** — only if impersonation sets a non-null `auth.uid()`. RPC EXPLAIN of the live wrappers.
5. **After migrate:** 0b, C–D (shared RPC + identity), G (body-only on `si.organization_id`).

Do not use the zero UUID. Do not paste the whole file as one query.

---

## Results (paste live rows here)

### Block 0 — `pg_stat_statements` ranking

```
(query_preview, calls, mean_ms, max_ms, total_s)
```

**Not captured 2026-09-02** — aborted by the RPC 42501 in the same batch.

### Blocks E–G — body-only EXPLAIN

**Not captured.**

### Blocks A–D — RPC EXPLAIN / identity

**Not captured** (auth). After 0c or after migrate.

---

## Related

- `scripts/phase-3-line-item-search-explain.sql` — this playbook
- `scripts/invoice-dashboard-search-invoice-sale-ids-verify.sql` — AUTH 0c pattern
- `docs/phase-1-rollback-storm-2026-09.md` Appendix B — index scans (separate PR); both `idx_sale_items_sale` and `idx_sale_items_saleid` are hot
