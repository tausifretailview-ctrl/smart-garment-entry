

## Investigation: Slow Billing and Transactions in ELLA NOOR

### Root Cause Identified

The core performance problem across **all billing/entry forms** is the same pattern: **every form fetches ALL products (with ALL variants) and ALL customers/suppliers on page load**, looping through 1000-row pages until everything is downloaded. For ELLA NOOR with a large product catalog, this means:

1. **POSSales** — fetches ALL products + variants in a loop on mount (lines 769-836)
2. **SalesInvoice** — fetches ALL products + variants + size_groups in a loop (lines 408-468)
3. **PurchaseEntry** — fetches ALL suppliers (`select("*")`) in a loop (lines 291-321)
4. **QuotationEntry** — fetches ALL customers (`select("*")`) + ALL products (`select("*, product_variants (*)")`) in loops (lines 291-358) — **no staleTime, no refetchOnWindowFocus:false**
5. **SaleOrderEntry** — fetches ALL customers + ALL products (`select("*, product_variants (*)")`) in loops (lines 303-370) — **no staleTime**
6. **PurchaseOrderEntry** — fetches ALL suppliers (`select("*")`) + ALL products (`select("*, product_variants (*)")`) in loops (lines 240-302) — **no staleTime**
7. **DeliveryChallanEntry** — fetches ALL products + variants + size_groups in a loop (lines 140-182) — **no staleTime**

Additionally, **QuotationEntry, SaleOrderEntry, PurchaseOrderEntry, and DeliveryChallanEntry** are missing `staleTime` and `refetchOnWindowFocus: false`, so every tab switch triggers a full re-download.

### Optimization Plan

**Phase 1: Add caching to all entry forms (quick win, biggest impact)**

Add `staleTime: 300000` (5 min) and `refetchOnWindowFocus: false` to all product and customer/supplier queries in:
- `QuotationEntry.tsx` — customers query + products query
- `SaleOrderEntry.tsx` — customers query + products query
- `PurchaseOrderEntry.tsx` — suppliers query + products query
- `DeliveryChallanEntry.tsx` — products query

This alone will prevent redundant re-fetches when users switch tabs or navigate back.

**Phase 2: Use explicit column lists instead of `select("*")`**

Replace `select("*")` and `select("*, product_variants (*)")` with explicit columns:
- Products: `id, product_name, brand, hsn_code, gst_per, product_type, status, category, style, color`
- Variants: `id, barcode, size, color, stock_qty, sale_price, mrp, pur_price, product_id, active, deleted_at`
- Customers: `id, customer_name, phone, email, address, gst_number, discount_percent`
- Suppliers: `id, supplier_name, phone, email, gst_number, address`

This reduces payload size significantly for each row.

**Phase 3: Shared query keys for cross-page caching**

Multiple entry forms use different query keys for the same data:
- `['products-with-variants']`, `['pos-products']`, `['products-all']`, `['products-with-stock']` — all fetch the same products table

Standardize to shared keys so navigating between POSSales → SalesInvoice → SaleOrderEntry reuses cached data instead of re-fetching.

### Files to Modify
- `src/pages/QuotationEntry.tsx` — add staleTime, explicit columns
- `src/pages/SaleOrderEntry.tsx` — add staleTime, explicit columns
- `src/pages/PurchaseOrderEntry.tsx` — add staleTime, explicit columns
- `src/pages/DeliveryChallanEntry.tsx` — add staleTime, explicit columns
- `src/pages/PurchaseEntry.tsx` — explicit columns for suppliers (already has staleTime)
- `src/pages/SalesInvoice.tsx` — already optimized, just verify
- `src/pages/POSSales.tsx` — already optimized, just verify

### Impact
- Eliminates redundant full-catalog re-fetches on tab switches (~4-6 unnecessary fetches per session)
- Reduces payload size by 30-50% with explicit columns
- Cross-page cache sharing means product data loads once per 5 minutes instead of once per page visit

