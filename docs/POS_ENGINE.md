# POS Billing Engine (`usePosBilling`)

Phase 1 extraction of the desktop POS money pipeline for reuse (e.g. mobile). **Sale Invoice math is intentionally not shared** — see `docs/POS_EXTRACTION_AUDIT.md` §4.

## Entry points

| Module | Role |
|--------|------|
| `src/hooks/usePosBilling.ts` | Headless React hook: cart state, mutators, totals, edit/hold restore, `buildSaleData` |
| `src/lib/posBilling/*` | Pure DOM-free math + cart mutators (callable from Vitest / RN) |
| `src/utils/posGstTotals.ts` | Flat discount + exclusive bill GST (called, not reimplemented) |
| `src/hooks/useSaveSale.tsx` | Persist path — **unchanged**; caller passes `buildSaleData()` into it |

## Hook inputs (explicit — no settings context inside)

| Param | Meaning |
|-------|---------|
| `grossBasis: 'mrp' \| 'sale_price'` | Add-line price basis. POSSales passes `'mrp'` iff `enable_mrp && pos_barcode_price_mode === 'mrp'`, else `'sale_price'`. |
| `garmentGstSettings` | Purchase-settings garment rule pair (caller resolves). |
| `calculateRedemptionValue` | Injected from `useCustomerPoints` (points → ₹). |
| `initialTaxType` | Seed for local bill `taxType` (`inclusive` \| `exclusive` \| `no_gst`). |
| `initialItems` | Optional session cart hydrate. |

## Hook outputs (high level)

- Cart: `items`, `setItems`, `itemsRef`
- Bill knobs: flat discount, `taxType`, S/R adjust, credit applied, round-off (+ manual flag), points to redeem
- Derived: `totals` (`computePosBillTotals`), `maxSrFromBill`
- Mutators: `addLine`, `updateQty`, `updatePrice`, `updateDiscountPercent` / `Amount`, `updateMrp`, `updateGstPer`, `removeLine`, `clearCart`
- Restore: `loadFromSaleEdit`, `loadHeldCart`
- Persist shape: `buildSaleData(meta)` → payload for `saveSale` / `updateSale` / `holdSale` / `resumeHeldSale`
- Errors: mutators return `{ error?: PosBillingError }`; UI (toast) stays in `POSSales.tsx`

## Totals pipeline (preserved order)

1. Line nets via `calculatePosCartLineNet` (MRP×qty − Disc% − Disc₹ − (MRP−unit)×qty)
2. `computePosFlatDiscount` on (MRP total − S/R), then cap with `maxCombinedDiscountForGross − lineDiscount`
3. `computePosBillGst` (exclusive only; inclusive / `no_gst` → `totalGst: 0`)
4. `amountBeforeRoundOff` (exclusive adds GST; subtracts flat, S/R, credit)
5. Auto `roundOff = Math.round(amount) - amount` unless manual
6. **Points after round-off:** `finalAmount = amountBeforeRoundOff + roundOff - points`

## Deliberately preserved quirks (fix backlog)

1. **Points after round-off** — differs from Sale Invoice (points before round). Changing order changes net ₹.
2. **Disc ₹ is immediately mapped to Disc%** and `discountAmount` cleared on the line — Disc₹ column is not persisted as ₹.
3. **Combined discount cap = full gross** (`maxCombinedDiscountForGross` ≈ gross) — not a tighter business policy.
4. **Brand-discount toast can fire under MRP basis** even though Disc% is forced to 0 when `grossBasis === 'mrp'`.
5. **Edit load trusts `sale_items.line_total` as `netAmount`** — does not recompute from Disc%/unit; flat restore via `resolveBillFlatForPosEdit` heuristics.
6. **`Math.round` half-up toward +∞ for `.5`** (JS default) for auto round-off — not banker’s rounding.
7. **Flat input normalized to whole rupees** (`normalizeFlatDiscountInput`) — paise typed in flat field are rounded away.
8. **Inclusive / no_gst never write bill-level GST** even when lines carry `gstPer` — product tax rates do not invent a GST summary.
9. **Gross header is always Σ MRP×qty**, not Σ unit×qty — savings/discount figures include the MRP−unit gap.
10. **Service barcode merge** keys on barcode+variant+price; non-service merges on barcode only (qty++ keeps prior Disc%).

## Characterisation tests

`src/lib/posBilling/posBilling.characterisation.test.ts` — must stay green across refactors. Covers all three `taxType`s, line/flat caps, both gross bases, round-off / points order, mixed GST, qty/price after discount, hold resume totals, edit restore.

## Mobile UI (Phase 2)

| Piece | Location |
|--------|----------|
| Route | `/:orgSlug/mobile-pos` (`App.tsx`) — permission `pos_sales` |
| Screen | `src/pages/mobile/MobilePosBilling.tsx` — UI only; totals from `usePosBilling` |
| Nav | More → **POS Bill**; Sales hub **New Bill**; bottom **Scan** opens POS+camera when not already on POS |
| Scan | `MobileScanContext` — billing handler registered on POS page; else stock sheet |

## Share / PDF (Phase 3)

Success screen **Share / PDF** opens `MobileSalePrintPreviewDialog` with `preferPosFormat` (uses `sale_settings.pos_bill_format`, fallback sale `bill_format`). PDF delivery is `captureElementToPdfBlob` → `deliverPdfBlob` (Web Share / open / download). Native `@capacitor/filesystem` / `@capacitor/share` remain out of scope. Auto WhatsApp API PDF on save is not wired from mobile POS.

## Out of scope (Phase 1 / still)

- `SalesInvoice.tsx` / Sale settlement reconciliation
- Hardening `useSaveSale` transactionality
- Changing MRP or GST product rules
- Capacitor Filesystem/Share plugins + APK rebuild for native PDF share
