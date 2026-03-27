
Goal: fix the Velvet organization product issues cleanly without changing the existing UI design.

What I found
- The backend pagination RPCs are present and working for Velvet. I verified `get_product_catalog_page` and `get_product_dashboard_stats` directly against the Velvet org and barcode `150005317`; they return the expected product fast.
- RLS is not the problem here. `products` and `product_variants` both have org-scoped SELECT policies.
- The current Product Dashboard issue is now frontend-side:
  1. the debounce is implemented incorrectly in `src/pages/ProductDashboard.tsx`
  2. multiple overlapping search requests can race each other
  3. the empty state can render while a newer request is still in flight, causing the temporary “No products found” flash
  4. only some filter dependencies trigger refetches, so state can become inconsistent
- POS is still using the old heavy pattern: preload the full product catalog with nested variants into `productsData` in `src/pages/POSSales.tsx`, then filter client-side. For Velvet-sized data this is slow and can make products appear missing until the preload completes.
- In POS, `searchAndAddProduct()` currently exits early if `productsData` is not loaded yet, so scans/searches can silently fail before the preload finishes.
- The mobile/desktop POS search UI also lacks a proper loading state, so “not listing” is easy to hit during slow preload.

Implementation plan
1. Stabilize Product Dashboard search
- Replace the broken debounce tuple with a proper `useRef<ReturnType<typeof setTimeout> | null>`.
- Add request sequencing / stale-response protection so only the latest search/stats response updates state.
- Keep previous rows visible during refetch and show a loading indicator instead of switching to the empty state.
- Show “No products found” only when the latest request has fully settled and returned zero rows.
- Show the error banner/toast only for the latest failed request, not for stale/outdated ones.

2. Complete the paginated catalog flow
- Fix missing fetch dependencies so server-side refetch also responds to `selectedSizeGroup`, `minPrice`, and `maxPrice`.
- Pass the real size-group filter into the RPC params instead of always sending `null`.
- Keep the current pagination UI/layout unchanged.

3. Fix POS product listing for large organizations
- Stop relying only on the full-catalog preload for search usability.
- Add a lightweight server-side POS product search path for manual search and barcode lookup, similar to the proven Sales Invoice search strategy.
- Ensure barcode scans/searches still work even when the background catalog preload has not finished.
- Keep the existing fast local cache behavior when preload is available, but fall back to DB search immediately when it is not.

4. Improve POS search behavior
- Apply the selected product-type filter to actual search results.
- Add explicit loading state in the POS search dropdown instead of appearing blank.
- Keep exact-barcode priority, then name/brand/style search, with stock-aware filtering for goods and normal handling for service/combo products.
- Preserve current UI layout and workflow; only the data-loading/search behavior changes.

5. Validation after implementation
- Verify Product Dashboard search in Velvet with barcode `150005317`:
  - no temporary “No products found”
  - no “Bad Request” error
  - correct result appears consistently
- Verify POS:
  - product appears from manual search
  - barcode scan works before and after preload finishes
  - dropdown results show correctly for Velvet-sized data
- Recheck pagination counts and summary cards still match server-side filtered data.

Files I expect to update
- `src/pages/ProductDashboard.tsx`
- `src/pages/POSSales.tsx`
- possibly shared search/dropdown rendering only if needed for loading-state polish

Technical note
- The database timeout fix itself is in place; the remaining problem is frontend request coordination plus the fact that POS still uses the old full-catalog preload model instead of the new paginated/search-optimized approach.
