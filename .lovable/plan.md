# Fix: one IMEI scan adds a second, wrong IMEI line (MULUND MOBILITY)

## What is happening

In MULUND MOBILITY every phone is stocked as its own unit, and all units of the same model share a long common IMEI prefix. Confirmed in the data:

```text
351690536840864  WHITE     stock 1
351690536875167  SKY BLUE  stock 0
351690536882759  SKY BLUE  stock 1
351690536850707  SKY BLUE  stock 0
351690536810552  SILVER    stock 0
```

All five start with `3516905368`.

The POS barcode lookup tries an exact barcode match first, and if that finds nothing it falls back to a **"contains" match** (`barcode like %term%`, ordered by stock). That fallback exists for retail barcodes, but for serialized phones it is dangerous: any partial value — a scan that gets submitted before the last digits arrive, or a keyed-in prefix — matches a *different phone unit* and adds it to the bill. Then the complete IMEI arrives and adds the correct unit. Result: one scan, two lines, two different IMEIs — exactly the WHITE + SKY BLUE pair in the photo. It also explains a zero-stock unit landing on the bill.

## The fix

1. **No fuzzy barcode matching for serialized products.** In the POS lookup, when the partial ("contains") match resolves to a product that requires IMEI, discard it and treat the scan as "not found" instead of adding it. Exact IMEI match only — a phone must never be added by a partial code.
2. **Guard the auto-submit path.** When IMEI enforcement is on, do not auto-submit a value that is shorter than the org's configured IMEI minimum length; wait for the full code or Enter. This stops the truncated-scan submission at the source.
3. **Block adding a serialized unit with zero stock.** Serialized units are unique pieces; if `stock_qty <= 0` the unit is already sold and must raise the stock issue dialog rather than being added.
4. Keep normal (non-IMEI) accessories behaviour unchanged — shared EAN codes still resolve and merge as they do today.

## Verification

- Type the shared prefix `3516905368` alone in POS: nothing is added, error beep (today it adds a random unit).
- Scan `351690536840864`: exactly one line, WHITE, qty 1.
- Scan `351690536875167` (stock 0): stock issue dialog, no line added.
- Scan an ordinary accessory EAN: unchanged, merges qty as before.

## Technical detail

- `src/pages/POSSales.tsx`
  - `fetchPosVariantByBarcode`: after the `ilike('barcode', '%...%')` fallback, drop the row when its product requires IMEI (`productRequiresImei`).
  - `handleBarcodeInputChange` → `scheduleAutoSubmit` / manual-barcode debounce: skip submission while IMEI enforcement is on and the value is under `mobileERP.imei_min_length`.
  - Barcode-match branch in `searchAndAddProduct`: apply the zero-stock guard to IMEI products regardless of the existing `isStockTrackedPosProduct` path.
- No database or schema change; no other organization's behaviour changes (all guards sit behind `requires_imei` / Mobile ERP enforcement).
