# Sales Invoice Dashboard search — Items 2 & 3

**Branch:** `fix/invoice-dashboard-search-once`  
**Date:** 2026-08-09  
**Scope:** Items 2 and 3 only. Items 1 and 4 deliberately excluded (result semantics).

## Item 2 — resolve line-item sale ids once

`src/utils/invoiceDashboardData.ts` follows POS Dashboard #230:

- `resolveInvoiceSearch` calls `search_invoice_sale_ids` at most once when the term qualifies (`shouldUnionSaleItemsForInvoiceSearch`).
- Shared across count + page (`fetchInvoiceDashboardPage`), stats client pagination loop, and export unified fetch.
- Query shape unchanged: header text `.or(...)` plus optional `id.in.(lineItemIds)` — **no** gating on header hits (Item 1).

## Item 3 — index-driven RPC

Migration: `supabase/migrations/20261111120000_search_invoice_sale_ids_trgm_union.sql`

- Same signature / `SECURITY DEFINER` / `assert_org_member` / org+date+deleted filters / `LIMIT`.
- Per-column trigram `ILIKE` branches `UNION`ed (sale_items name/barcode/size/color; products style/category/brand → `product_id`).
- Creates `sale_items` gin_trgm indexes if missing.

## Explicitly NOT done

| Item | Why deferred |
|------|----------------|
| 1 — header-first, line-item only if empty | Drops product hits when term also matches a customer/sale number |
| 4 — cap All Time line-item lookup | Silent truncation without UI |

## Verification (required)

1. Apply migration; run `scripts/invoice-dashboard-search-invoice-sale-ids-verify.sql` on ELLA NOOR — `EXPLAIN (ANALYZE)` for customer name + product/barcode, before/after.
   - SQL Editor has no JWT → RPC hits `assert_org_member` → `42501 Authentication required`.
   - Run script step **0c** once per session (impersonate an `organization_members` user), then A–D.
   - If impersonation fails, use **E–G** (body-only UNION EXPLAIN, no assert).
2. Wall-clock All Time search on the dashboard.
3. Network tab: count `search_invoice_sale_ids` per settled search — expect ~1 for the table fetch (was 2+ for count+page; stats RPC uses its own SQL, not this RPC).

## Checklist

- [ ] Customer-name search: same invoices / count / order
- [ ] Product/barcode search: same rows, including term matching both product and customer
- [ ] Invoice-number search unaffected
- [ ] KPI / stats / rows / Excel agree
- [ ] All Time, no search: unchanged
- [ ] Date-bounded line-item search still date-filters
- [ ] Spot-check a second org
