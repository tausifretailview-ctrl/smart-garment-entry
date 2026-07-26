# Product deactivation audit — 2026-07

Phase 1 only (read-only). No code changes beyond this document.

**Scope:** `products.status` (`'active' | 'inactive'`) vs `product_variants.active` (boolean).  
**Existing write paths (do not rebuild):** ProductEntry Inactive option; ProductDashboard row toggle + `handleMarkProductInactive()`; soft-delete remains separate.

**Bucket rules (given):**

| Bucket | Must |
|--------|------|
| **Selling** | Exclude inactive (`status ≠ 'active'`) |
| **Reporting** | Include inactive (history / totals / exports) |
| **Admin** | Include inactive (so they can be reactivated) |
| **Purchase** | Noted separately — usually include inactive (old-stock receive / return) |

**Filter legend:** `yes SQL` · `yes client` · `no` · `n/a write` · `unknown (RPC)` (SQL not fully verified in latest cloud deploy)

---

## 1A — Products call-site classification

### Selling

| file:line | filters status? | purpose | verdict |
|-----------|-----------------|---------|---------|
| `POSSales.tsx:395–403` (`posVariantBaseQuery`) | yes SQL (`products.status`) | Shared POS barcode / variant base query | **correct** |
| `POSSales.tsx:458` | yes SQL | Unavailable (0-stock) name helper | **correct** |
| `POSSales.tsx:2255` | yes SQL | Typeahead `baseFilters` | **correct** |
| `POSSales.tsx:2307–2310` | yes SQL | Product-id search by name/brand | **correct** |
| `POSSales.tsx:2568` | yes SQL | Name fallback in `searchAndAddProduct` | **correct** |
| `POSSales.tsx:3787` | no | Post-sale commission hydrate (sold lines) | **correct** (not a picker) |
| `SalesInvoice.tsx:207–217` | yes SQL | Unavailable invoice variant by name | **correct** |
| `SalesInvoice.tsx:1383–1386` | yes SQL | Invoice product text search | **correct** |
| `SalesInvoice.tsx:1834–1844` | yes SQL | Invoice barcode scan | **correct** |
| `SalesInvoice.tsx:2187`, `:2262` | no | Edit-load hydrate for existing lines | **correct** |
| `saleOrderProductSearch.ts:203`, `:266`, `:279`, `:308` | yes SQL | SO / DC / Quotation product search helpers | **correct** |
| `SaleOrderEntry.tsx:346–349` | yes SQL | Prefetch active catalog | **correct** |
| `SaleOrderEntry.tsx:538` | no | Open size-grid by product id | **ok if** ids only from active search |
| `SaleOrderEntry.tsx:962–971` | yes SQL | SO barcode scan | **correct** |
| `QuotationEntry.tsx:413` | no | Size-grid by id | same as SO |
| `QuotationEntry.tsx:615–624` | yes SQL | Quotation barcode | **correct** |
| `DeliveryChallanEntry.tsx:330` | no | Size-grid by id (search via helpers) | search path **correct** |
| `usePosDeliveryChallan.ts:180–186` | yes SQL | Prefetch DC catalog | **correct** |
| `usePosDeliveryChallan.ts:272–285` | yes client | DB fallback; skip non-active | **correct** |
| `usePosDeliveryChallan.ts:299–305` | yes SQL | Name fallback | **correct** |
| `usePosDeliveryChallan.ts:529–539` | yes client | Barcode add requires active | **correct** |
| `SaleReturnEntry.tsx:304–307` | yes SQL | Return product load | **correct per Selling rule** (blocks return picker for deactivated SKUs) |
| `SaleReturnEntry.tsx:506–515` | yes client | Barcode fallback active check | **correct per rule** |
| `FloatingSaleReturn.tsx:457–460` | yes SQL | Floating return product load | **correct per rule** |
| `FloatingSaleReturn.tsx:703–712` | yes client | Barcode fallback active check | **correct per rule** |
| `salesman/SalesmanOrderEntry.tsx:284–287` | yes SQL | Name/brand/style search | **correct** |
| `salesman/SalesmanOrderEntry.tsx:300–310` | **no** | Barcode/color variant join — **no `products.status`** | **wrong** |
| `salesman/SalesmanOrderEntry.tsx:315–325` | no (ids from active query) | Variants for name matches | **correct** |
| `supabase/functions/portal-catalogue/index.ts:48–56`, `:80–84` | yes SQL | Customer portal catalogue | **correct** |

**Client-side Selling gates (inconsistent style, same intent):**  
`usePosDeliveryChallan.ts:285,539` · `SaleReturnEntry.tsx:515` · `FloatingSaleReturn.tsx:712` — fetch then `status === "active"`. SalesInvoice / POS filter in SQL.

### Purchase (ambiguous vs Admin)

| file:line | filters status? | purpose | verdict |
|-----------|-----------------|---------|---------|
| `PurchaseEntry.tsx` product search / barcode / hydrate (`:430`, `:867`, `:2392`, `:2799`, `:2976`, `:4848`, `:5308`, `:2154` via `fetchProductsByIds`) | no | Purchase pickers + bill hydrate | **likely correct** (include inactive) |
| `PurchaseEntry.tsx:5796+` | no / n/a write | Excel import match + create | **correct** / n/a |
| `PurchaseOrderEntry.tsx:268–271` | yes SQL | Prefetch PO catalog — active only | **ambiguous / likely wrong** if PO needs discontinued SKUs |
| `PurchaseOrderEntry.tsx:384` | no | Live PO search — inconsistent with catalog | **ambiguous** |
| `PurchaseReturnEntry.tsx:156`, `:687`, `:1000` | no | Return search / org check | **correct** |
| `PurchaseBillDashboard.tsx:456`, `:1425`, `:1062` | no | Style / name hydrate | **correct** |
| `PurchaseReturnDashboard.tsx:432` | no | Expand return names | **correct** |

### Reporting

| file:line | filters status? | purpose | verdict |
|-----------|-----------------|---------|---------|
| `StockReport.tsx` RPCs (`get_stock_report*`) | unknown (RPC) | Stock report | **unknown** — include expected |
| `StockReport.tsx:1499` Excel `products!inner` | no | Full export | **correct** |
| `ProductSearchDropdown.tsx:92` | no | StockReport filter search | **correct** |
| `ItemWiseSalesReport.tsx` via `fetchProductsByIds` | no | Sold-item meta | **correct** |
| `itemWiseStockQueries.ts` RPCs | unknown (RPC) | Product-wise stock | **unknown** |
| `useBusinessInsights.ts` RPCs | unknown (RPC) | Insights | **unknown** |
| `fetchAllRows.ts:500–503` `fetchAllProducts` | **yes SQL** | Used by Tally export | **wrong** for Reporting |
| `TallyExport.tsx` → `fetchAllProducts` | yes SQL (via helper) | Tally stock items | **wrong** — omits inactive |
| `fetchAllRows.ts:777` `fetchProductsByIds` | no | By-id hydrate | **correct** |
| `FloatingPOSReports.tsx:583`, `:634`, `:664` | no | Floating stock | **correct** |
| `SizeStockDialog.tsx` | no | Size-stock matrix | **correct** |
| `lookupBarcodeStock.ts:34` | no | Mobile stock barcode | **correct** |
| `lookupBarcodeSales.ts:127`, `:213` | no | Sale history by barcode | **correct** |
| `BarcodePrinting.tsx:2862` | no | Label product search | **correct** |
| `PriceHistoryReport.tsx` | no | Price history | **correct** |
| `ProductTrackingReport.tsx:275` | no | Movement history | **correct** |
| `StockAnalysis.tsx` / `StockAnalysisSearch.tsx` | no | Stock analysis | **correct** |
| `StockAgeingReport.tsx:105` | no | Ageing names | **correct** |
| `StockSettlement.tsx:349` | no | Physical count load | **correct** |
| `DailySaleAnalysis.tsx:253` | no | Velocity meta | **correct** |
| `StatsChartsSection.tsx:101` | no | Dashboard stock chart | **correct** |
| Mobile owner dashboards / stock / sales / purchase / report detail | no | Brand/stock maps | **correct** |
| `SaleReturnDashboard` / `SalesInvoiceDashboard` / `SaleOrderDashboard` / `SalesmanOrderView` / `mobileInvoicePreviewData` / `posDashboardSales` | no | History / print hydrate | **correct** |
| `SalesmanCommission.tsx:108` | no | Commission product picker (limit 500) | **correct** / slight ambiguous |
| GST report pages | n/a | No direct `products` reads (RPC / sale_items) | n/a |
| Edge: `ai-assistant`, `whatsapp-webhook` stock paths | no | Ops / alerts | **correct** for include |

### Admin

| file:line | filters status? | purpose | verdict |
|-----------|-----------------|---------|---------|
| `ProductDashboard.tsx` catalog RPC `get_product_catalog_page` | no status filter in SQL (latest migration) | Product Master list | **correct** (includes inactive; badge shows status) |
| `ProductDashboard.tsx:757` `get_product_dashboard_stats` | no status filter | KPI strip | **correct include**; **wrong metric binding** — see 1C |
| `ProductDashboard.tsx:587–594` | no | Filter option categories/types | **correct** |
| `productDashboardBarcodeSearch.ts:92` | no | Barcode supplement rows | **correct** |
| `ProductDashboard.tsx:339–345`, `:1026–1033` | n/a write | Toggle / mark inactive | n/a |
| `useBulkProductUpdate.tsx` reads | no | Bulk update match | **correct** |
| `ProductEntry.tsx` / `ProductEntryDialog.tsx` load/search | no | Create/edit | **correct** |
| `ProductEditPanel.tsx:147` | no | Side edit load | **correct** |
| `ProductImageUploader.tsx` | n/a write | Image sync | n/a |
| `productBrandUtils.ts:38` | no | Brand duplicates | **correct** |
| `barcodeValidation.ts:51` | no | Duplicate barcode check | **correct** |
| `PlatformAdmin.tsx:182` / `useOrganizationReset.tsx:74` | no | Ops counts | OK |

### Other

| file:line | filters status? | notes |
|-----------|-----------------|-------|
| `BrandDiscountDialog.tsx:69` | no | Distinct brands — inactive brands appear (**ambiguous**) |
| `stockCeilingValidation.ts:30` | no | Type for ceiling — **correct** |

### Reachability note (not a query bug)

Deactivation **works** but is hard to discover:

- Product Entry status dropdown (Inactive) — edit form only.
- ProductDashboard row action “Mark Inactive” / “Mark Active”.
- `handleMarkProductInactive` used when delete is blocked by relations dialog.
- Bulk selection toolbar has Generate Barcode / Merge / Delete — **no bulk Mark Inactive**.

---

## 1B — POS barcode scan path

### Architecture

Desktop, Tablet, and Mobile POS **share one resolver** in `POSSales.tsx`:

| Surface | Shell | Submit |
|---------|-------|--------|
| Desktop | `POSSales` barcode input | → `searchAndAddProduct` |
| Tablet | `TabletPOSLayout` | `onBarcodeSubmit` → same (`POSSales.tsx` ~5470) |
| Mobile | `MobilePOSLayout` / `MobilePOSHeader` | `onBarcodeSubmit` → same (~5601) |

Core query: `posVariantBaseQuery` → `fetchPosVariantByBarcode`:

```395:403:src/pages/POSSales.tsx
function posVariantBaseQuery(orgId: string) {
  return supabase
    .from('product_variants')
    .select(POS_VARIANT_LOOKUP_SELECT)
    ...
    .eq('products.status', 'active');
}
```

### Can a deactivated product still be scanned and sold?

| Surface | `products.status='inactive'` + `variant.active=true` | Notes |
|---------|------------------------------------------------------|-------|
| Desktop POS | **NO** | Scan gated by `products.status='active'` |
| Tablet POS | **NO** | Same `searchAndAddProduct` |
| Mobile POS | **NO** (normal scan) | Same path |

**Feature is not cosmetic on POS scan** — deactivation blocks the primary barcode path.

### `products.status` vs `product_variants.active`

| Path | `products.status` | `product_variants.active` |
|------|-------------------|---------------------------|
| Scan add (`fetchPosVariantByBarcode`) | must be `active` | **ignored** |
| Typeahead dropdown (`baseFilters`) | must be `active` | must be `true` |
| Name fallback in scan | must be `active` | ignored |
| Mobile-ERP `purchase_items` IMEI fallback (`POSSales` ~2604–2644) | **not filtered** | **not filtered** |

**Asymmetry:** Active product + `variant.active=false` **can still be sold by scan**, but will not appear in typeahead.

**Other Selling gap:** `SalesmanOrderEntry` barcode/color search (~300–310) does **not** filter `products.status` — inactive can still be ordered via salesman barcode path.

---

## 1C — “Active Products” KPI vs list (screenshot: KPI 2, list 3 ACTIVE)

### What the UI binds

```1525:1579:src/pages/ProductDashboard.tsx
const totalItems = dashboardStats.total_items;
...
title="Active Products"
value={totalItems.toLocaleString("en-IN")}
```

`dashboardStats` comes from `get_product_dashboard_stats` (`ProductDashboard.tsx:757`).  
List “N results” comes from `get_product_catalog_page` `total_count` (plus client barcode-supplement bump).

### Cause (not a status filter lie on the badge)

**Different metrics, mislabeled — not “list ignores status while KPI filters active”.**

From the latest in-repo definition (`supabase/migrations/20260710100000_product_dashboard_service_stock.sql`):

```sql
SELECT jsonb_build_object(
  'total_products', COUNT(*)::bigint,                    -- product count
  'total_items', COALESCE(SUM(variant_count), 0)::bigint, -- SUM of variants
  ...
)
```

- KPI card **“Active Products”** displays **`total_items` = sum of variant counts**.
- RPC also returns **`total_products`**, which the UI **never reads**.
- Neither stats nor catalog RPC filters `products.status` — inactive products are included; the Active badge on a row is the row’s real `status` field (`p.status || "active"`), not derived from the KPI.
- Screenshot (search `REVLON`, 3 product rows, KPI `2`) fits **3 products with a combined 2 variants** (e.g. one product has zero non-deleted variants), or the same scope with variant-sum ≠ product-count.

Secondary contributors (usually smaller):

1. **Barcode supplement** can add list rows and bump `totalCount` client-side (`ProductDashboard.tsx:668–718`) without updating stats.
2. **Search field asymmetry** between catalog vs stats RPCs (stats also matches style/category/color/HSN; catalog search is narrower in `20260912140000_...`) — not the REVLON case.
3. Label says “Active” but RPC does **not** filter `status = 'active'`.

**Verdict for 1C:** Scope is shared (same `buildRpcParams` / `rpcFilterKey`). The mismatch is **wrong field + wrong label** (`total_items` / variants vs product count / active count), not a lying Active badge on the rows.

---

## Recommended fix list — Phase 2 approved order

**Confirmed 1C (screenshot):** REVLON rows variant counts `0 + 1 + 1 = 2` matches the KPI card.

**Tally note (ordering prerequisite):** `fetchAllProducts` already filters `.eq("status","active")` — the bug is that filter, not a missing one. Exporting active-only masters while exporting date-range vouchers that reference deactivated sold items breaks Tally import. Fix is **not** “export every inactive forever” (bloats masters). Fix is: masters for products that are **active OR referenced by any transaction in the export window**. **Must ship before bulk deactivate.**

**Hold — `product_variants.active` on POS scan:** Do not gate scan on this flag until semantics are confirmed (discontinued size/colour vs vestigial/import side-effect). Blocking a real sale at the counter is worse than leaking a deactivated product.

| # | Item | Status |
|---|------|--------|
| 1 | Salesman barcode status gate | **done** (2026-07-26) |
| 2 | IMEI fallback gate (`products.status`) | **done** (2026-07-26) |
| 3 | Tally master/voucher coverage (active ∪ referenced-in-window) | Phase 2 — **before** bulk deactivate |
| 4 | Bulk Mark Inactive + Reactivate + Master status filter | Phase 2 |
| 5 | KPI: bind `total_products`, rename to “Products” / “In catalog” (frontend-only; no RPC) | Phase 2 |

Deferred / separate approval: RPC status-aware Active KPI; scan gate on `product_variants.active`; sale-return inactive carve-out; PO catalog align; BrandDiscountDialog.

---

## Phase 2

Proceed one item at a time; build + regression notes after each.

### Item 1 — Salesman barcode status gate (done)

**Change:** `src/pages/salesman/SalesmanOrderEntry.tsx` — barcode/color variant search (~300) and the follow-up **`.in("product_id", productIds)`** hydration (~315–332) now require `products.status = 'active'`, `products.deleted_at IS NULL`, and `products.organization_id` match (aligned with the existing name search). Confirmed: that follow-up is exactly the line-315 hydration, not a different path.

**Not touched (history / writes):**
- `SalesmanOrderView.tsx:99–106` — hydrate brand/style for saved `sale_order_items` (Reporting; must include inactive).
- `SalesmanOrderEntry.tsx:555` — `discount_percent` field on **insert** of new order items (write), not a product load.

**Build:** `tsc --noEmit` only at ship time (checklist prefers `npm run build` — done with item 2).

**Regression notes (non-vacuous):**
- Both search queries also have `.gt("stock_qty", 0)`. A zero-stock inactive SKU was already invisible — that test proves nothing.
- **Required case:** product with `status='inactive'` and **`stock_qty > 0`** (units left, not selling). Barcode/color search must not return it; active + stock > 0 must still work.
- Soft-deleted product must not appear on either path.
- Does **not** gate on `product_variants.active` (held pending semantics).
- Agent did not run a live UI session against production; confirm the stock-bearing case in-app.

### Item 2 — IMEI / purchase_items fallback status gate (done)

**Change:** `src/pages/POSSales.tsx` — after resolving `purchase_items.sku_id` for a scanned IMEI (mobile ERP path only), the variant reload now matches `posVariantBaseQuery`: org match, `products.status = 'active'`, `products.deleted_at IS NULL`. Does **not** filter `product_variants.active`.

**Not touched:** `SalesmanOrderView`, `SalesmanOrderEntry` save/insert, primary `fetchPosVariantByBarcode` (already gated).

**Build:** `npm run build` exit 0.

**Regression notes (stock-bearing — the important case for mobile/electronics):**
- Mobile ERP on. Active product, unit still on hand (`stock_qty > 0`), IMEI only on `purchase_items` (or legacy path that hits this fallback) → scan still adds to cart.
- Same unit’s product set to `inactive` with stock still > 0 → fallback must **not** add; scan fails like a miss (same as primary barcode path).
- Zero-stock inactive is a weaker test (stock dialog / miss already possible); prefer discontinued model with units left.
- Garment tenants with `mobileERP` off never hit this branch — no behaviour change.
