

## Problem
Service products (product_type = 'service') are not working properly in the **Sales Invoice** billing flow. They work in POS because POS has explicit service product handling, but SalesInvoice has several blockers:

1. **Search query filters by stock > 0** (line 940): `.gt("stock_qty", 0)` excludes service products that have 0 stock
2. **Barcode scan fallback requires stock** (line 1236): `v.stock_qty > 0` prevents barcode-scanned service products from being found
3. **Stock validation blocks service products** (lines 1119-1132): `checkStock` is called before adding items — the hook already handles services correctly (returns unlimited), so this should work, but the item never reaches validation because it's filtered out earlier
4. **Size grid variant display filters by stock** (around line 1089): `stock_qty` subtraction may show 0 for services

POS already handles this correctly with product_type checks throughout its flow.

## Solution
Update `SalesInvoice.tsx` to allow service (and combo) products through stock filters, matching the POS behavior.

## Changes — `src/pages/SalesInvoice.tsx`

### 1. Search query: allow service/combo products regardless of stock
**Line 940** — Change the variants query to include service/combo products alongside stock > 0 items. Since we can't easily do OR with product_type in a joined query, we'll remove the `.gt("stock_qty", 0)` filter and instead filter results client-side after fetching, keeping service/combo products and stock > 0 goods.

Replace `.gt("stock_qty", 0)` with a post-fetch filter that checks: if product_type is service/combo, keep it; otherwise require stock > 0.

### 2. Barcode scan fallback: allow service products with 0 stock
**Line 1236** — Change condition from `v.stock_qty > 0` to also allow service/combo product types:
```typescript
v.barcode?.toLowerCase() === searchTerm.toLowerCase() && 
  (v.stock_qty > 0 || foundProduct?.product_type === 'service' || foundProduct?.product_type === 'combo')
```
Since `foundProduct` isn't set yet at this point, check the parent product's type directly.

### 3. Size grid variant display: show service variants regardless of stock
In the variant filtering/display for the size grid dialog, ensure service product variants are shown even with 0 stock.

### 4. Deduplication: keep service variants even with 0 stock
In the deduplication logic (~line 990-1005), service products should not be penalized for having 0 stock.

All changes are confined to `src/pages/SalesInvoice.tsx`. The stock validation hook (`useStockValidation`) already correctly handles service products by returning unlimited availability.

