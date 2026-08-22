# Barcode scan — doubled read investigation (KS Footwear)

## Symptom

Purchase Return scan shows **Product not found** for `00400152410040015241` while stock report shows qty available for the same item (`0040015241`).

## Root causes (two independent paths)

### 1. App: failed scan leaves input uncleared → concatenation

**File:** `PurchaseReturnEntry.searchAndAddProduct`

On **Product not found**, the search field was **not cleared**. Staff (or auto-submit) scans again; the second read **appends** to the first:

```
1st scan → field: 0040015241     → lookup fails → field stays full
2nd scan → field: 00400152410040015241 → error shows doubled string
```

This matches errors where the scanned string is **exactly two identical halves**.

**Fix:** Clear scan input after every scan attempt (success or failure). Use `expandBarcodeScanCandidates()` before lookup so a doubled string still resolves.

### 2. Hardware / scanner: duplicate transmission in one burst

Some USB/Bluetooth scanners emit the barcode **twice in one trigger** when:

- Suffix (Enter/Tab) is misconfigured — buffer flushes twice
- "Repeat on hold" or double-read mode enabled
- Inter-character delay too high — host treats one label as two

The app receives all 20 digits in one fast burst (`useBarcodeScanner` sees one scanner-like input).

**Fix:** Same candidate expansion. **Ops:** configure suffix once, disable duplicate/repeat modes, test with Notepad (one line per trigger).

### 3. Data: purchase bill barcode ≠ live variant barcode (KS merges)

Stock Report / POS resolve **`purchase_items.barcode → sku_id → product_variants`**. Purchase Return previously only queried **`product_variants.barcode`**, so stock-by-sku looked fine while scan failed on the **bill label**.

Documented in `stockReportPurchaseBarcodeResolve.ts` (KS Footwear duplicate master merges).

**Fix:** Shared `lookupVariantRowsByScan()` calls `resolvePurchaseBarcodesForStockReport` after variant miss.

## Canonical lookup (all scan surfaces)

| Utility | Used by |
|---------|---------|
| `expandBarcodeScanCandidates()` | All scan entry points |
| `lookupVariantRowsByScan()` | `lookupBarcodeStock`, Purchase Return, (future: Sale Return, Quotation) |
| `resolvePurchaseBarcodesForStockReport()` | Fallback inside `lookupVariantRowsByScan` |

## Verify after deploy

1. Purchase Return → scan `00400152410040015241` → line adds (matches `0040015241`)
2. Scan once, get error → field empty → rescan does not concatenate
3. Mobile stock scan (`BarcodeStockScanSheet`) → same doubled string resolves

## Scanner checklist (KS Footwear counter)

- [ ] One scan = one line in Notepad
- [ ] Suffix: Enter (or Tab) once at end
- [ ] Duplicate scan / auto-repeat: **off**
- [ ] Label prints single barcode under item (not duplicated on sticker)
