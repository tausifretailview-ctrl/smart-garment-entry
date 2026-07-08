## Goal

Once a product is scanned and saved in **Stock Settlement** (open session, not yet settled), completely block it from being sold in **POS (desktop + mobile)** and **Sale Entry** until the settlement session is settled. Stock Report already shows the "In settlement" badge — leave as-is. Scan-more-than-stock is already allowed in Stock Settlement — no change.

## What changes

### 1. Shared reservation helper
Reuse existing `fetchAllOpenSettlementVariantIds(orgId)` from `src/utils/stockSettlementScans.ts` (returns `Set<variantId>` of all open/unsettled scans). Wrap it in a small React hook `useOpenSettlementVariantIds()` in `src/hooks/useOpenSettlementVariantIds.ts` that:
- Loads the set on mount, scoped to `currentOrganization.id`.
- Refetches on tab focus (uses existing `useVisibilityRefetch` pattern) and after a POS sale save (invalidation event).
- Exposes `{ lockedVariantIds, isLocked(variantId), refresh() }`.

### 2. POS (desktop + mobile) — block add
Files: `src/pages/POS.tsx` (or the POS hook that handles barcode/product select) and the mobile equivalent used by `MobilePOSLayout` (`onProductSelect` / `onBarcodeSubmit`).
- Before adding a variant to the cart (both barcode scan path and product picker path), call `isLocked(variantId)`.
- If locked, do NOT add. Show destructive toast:
  > "Product locked — currently in Stock Settlement. Settle the open session before selling."
- Applies to every add path: barcode enter, product dropdown select, and quantity increase on an already-blocked line (defence in depth — normally already-in-cart lines can't be locked because the check happens at add time, but re-check on qty-up in case a session opened mid-bill).

### 3. Sale Entry — block add
File: `src/pages/SaleEntry.tsx` (and the shared row-add / barcode handler it uses).
- Same check as POS on line add / barcode scan. Same toast copy.
- No block on editing an existing saved sale's line qty downward — only on adding a locked variant or increasing qty above what was already on the invoice.

### 4. Stock Settlement page
No behavior change — scanning any qty (including > software stock) already works. Just make sure that after **Save** (persisting open scans) the reservation is immediately live: no extra work needed because POS/Sale Entry read the same `stock_settlement_scans` table with `settled = false`.

### 5. Not in scope (per user)
- Sale Order, Quotation, Delivery Challan — unchanged.
- Stock Report badge — unchanged.
- Scan-more-than-stock — unchanged (already allowed).

## Technical notes

- No schema/migration changes. Uses existing `stock_settlement_scans` rows with `settled = false`.
- Reservation is org-scoped via `organization_id` filter already in `fetchAllOpenSettlementVariantIds`.
- Cache: 30-second stale time + visibility refetch — cheap query (single indexed column `settled`, small result set).
- Error path: if the reservation query fails, fail-open (allow sale) and log — do not block business on a transient network error.

## Files touched

```text
NEW  src/hooks/useOpenSettlementVariantIds.ts
EDIT src/pages/POS.tsx                       (barcode + product-select add paths)
EDIT src/components/mobile/MobilePOSLayout.tsx or the POS parent that wires it
EDIT src/pages/SaleEntry.tsx                 (barcode + product-select add paths)
```

## Acceptance

1. Scan a product in Stock Settlement, click Save. In POS (desktop and mobile) scanning that barcode shows the "Product locked" toast and does NOT add the line. Same in Sale Entry.
2. Settle the session in Stock Settlement. The same variant becomes sellable again immediately (after auto-refresh on next add or manual re-scan).
3. Stock Report still shows the existing "In settlement" badge — unchanged.
4. Scanning qty > software stock in Stock Settlement continues to work with no blocking.
