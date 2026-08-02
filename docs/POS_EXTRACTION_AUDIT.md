# POS / Sale Billing Extraction Audit (Phase 0 — Read-Only)

**Date:** 2026-08-02  
**Scope:** Reuse existing POS/Sale billing engine in mobile — logic vs desktop-only layout  
**Rules followed:** No application code changes; no migrations; no DB writes. Every claim has a `file:line` reference or is marked **NOT FOUND**.

**Watch items (per brief):**
- **§4** — POS and Sale already disagree on several money numbers today; settle before extraction.
- **§6** — Capacitor plugins *are* called from the remote-URL WebView today (App/Network/Splash/StatusBar/Keyboard). `@capacitor/filesystem` and `@capacitor/share` are **not** installed; PDF share currently uses Web Share API / `window.open` / `<a download>` only — prove that path on device before Phase 3 scopes native PDF delivery.

---

## 1. COMPONENT MAP — `POSSales.tsx`

File: `src/pages/POSSales.tsx` (8209 lines). Component starts at `539`.

### (a) State declarations

| Range | Contents |
|-------|----------|
| `169–207` | Module types: `PendingPriceSelection`, `CartItem` |
| `209–212` | `POSBarcodeRuntimeSettings` |
| `539–554` | Hooks: org, permissions, POS context, `useSaveSale`, credit notes, `useIsMobile` / `useIsTablet`, WhatsApp |
| `555–613` | Core bill state: hold flag, credit/SR, customer, search, cart `items`, flat discount, SR adjust, round-off |
| `614–830` | UI/dialog state: product search, edit/print, payment, mix, unit-price draft/confirm, salesman, quick service, financer, floating reports |
| `1318–1428` | Settings-derived runtime: `posRuntimeSettings`, `taxType` (after `useSettings`) |
| `1597` | `webDesktopPos` |
| `1909–1994` | Hold panel + DC transfer dialog state |

Cart state shape is `CartItem[]` at `596–607` (`items` / `setItems` / `itemsRef`).

### (b) Derived / computed values

| Range | Contents |
|-------|----------|
| `1338–1424` | `enableMrp`, grid cols, garment GST settings, unit-price gates, bill format / thermal CSS, preview flag, default tax type |
| `1434` | `invoiceTaxType` |
| `3388–3404` | `totals` object (qty, mrp, discount, subtotal, savings) — **not** a `useMemo` |
| `3406–3424` | Flat discount via `computePosFlatDiscount` + `maxCombinedDiscountForGross` cap |
| `3426–3436` | `posGst` / `amountBeforeRoundOff` |
| `3439` | `calculatedRoundOff` |
| `3475–3479` | Points redemption + `finalAmount` |
| `3482+` | Max S/R against payable |
| `5584` | `filteredProducts` (`useMemo` over search results) |
| `5602–5678` | Pre-built dialog JSX fragments (`creditCustomerRequiredDialog`, `unitPriceConfirmDialog`) |

Module-level pure helpers (outside component): `calculatePosCartLineNet` `244–249`, `resolveBillFlatForPosEdit` `295–335`, `posLineNetUnitPrice` `338–340`, `applyPosGarmentGstToItem` `493–508`, barcode/variant lookup helpers `220–451`.

### (c) Side effects (`useEffect`)

35 `useEffect` calls; first `884`, last `5594`. Notable groups:

| Range | Purpose |
|-------|---------|
| `884–1114` | Cart persistence, barcode scanner wiring, URL `saleId` load, focus/click guards |
| `1322–1336` | Settings → `posRuntimeSettings` |
| `1430–1432` | Sync `taxType` from settings default |
| `1474–1568` | Global keyboard (F1–F11 / Esc) under POS |
| `1572–1907` | Defaults (discount/payment), clock, desktop media query, invoice preview query, hold list |
| `1961–2133` | Invoice navigation keys, customer flat discount auto-apply |
| `2282–2511` | Product search debounce / cleanup |
| `3442–3453` | Auto round-off sync |
| `3552–3771` | WhatsApp PDF snapshot, estimate print registration |
| `5586–5599` | Product dropdown selection/scroll |

### (d) Event handlers

| Range | Handler cluster |
|-------|-----------------|
| `719–844` | Flat discount input, stock-issue dialog, scan clear |
| `1126–1314` | `loadSaleForEdit` |
| `1441–1468` | `triggerPosAutoPrintIfEnabled` |
| `1709+` | `handleSaveMetadataChanges` |
| `2156–2280` | `handleSearch`, `handleBarcodeInputChange` |
| `2534–2730` | `searchAndAddProduct` (barcode + name) |
| `2732–3125` | `handleQuickServiceAdd`, `addItemToCart` |
| `3128–3386` | Price selection, remove, qty, disc %, disc ₹, unit price, MRP, GST % |
| `3456–3472` | Round-off / final-amount reverse |
| `3504+` | Sale-return apply to bill |
| `3584–3774` | WhatsApp PDF capture, estimate print |
| `3776–4500+` | Credit apply, `handleSaveSale`, payment+print, mix payment |
| `4708–5219` | Print / WhatsApp share / invoice nav / clear / new |
| `5295–5374` | Resume / delete / hold bill |
| `5386–5550+` | `sendWhatsAppInvoice`, add-customer mutation |

#### Handlers that mix calculation with DOM/UI concerns

| Handler | Lines | Mix |
|---------|-------|-----|
| `addItemToCart` | `2857–3125` | Line math + stock check + toast/beep + focus barcode + price-selection dialog |
| `searchAndAddProduct` | `2534–2730` | Lookup + cart add + beep + clear input + stock dialog |
| `updateDiscountPercent` / `updateDiscountAmount` | `3180–3259` | Cap math + toast on over-cap |
| `requestUnitPriceCommit` | `3313–3345` | Price math + confirm dialog state |
| `handlePaymentAndPrint` / mix save | `4036+`, `4243+` | Settlement + save + print/WhatsApp + focus/clear |
| `handleBarcodeInputChange` | `2178–2280` | Debounce timers + DOM input + `searchAndAddProduct` |
| Keyboard `useEffect` | `1474–1568` | Payment/print shortcuts + `preventDefault` / focus |
| `triggerPosAutoPrintIfEnabled` | `1441–1468` | Print DOM ref + cash drawer + focus |
| `captureWhatsAppPdf` / `sendWhatsAppInvoice` | `3584+`, `5386+` | html2canvas from DOM + network send |

### (e) JSX / layout

| Range | Layout |
|-------|--------|
| `5681–5808` | Tablet early return → `TabletPOSLayout` |
| `5810–6012` | Mobile early return → `MobilePOSLayout` (+ shared portals/dialogs) |
| `6014–~8209` | Desktop POS: left action rail, customer/search header, cart grid, footer totals, dialogs, print portal |

**Note:** Mobile already has a thin layout shell (`MobilePOSLayout` etc.) but billing state/handlers remain inside `POSSales.tsx` — layout is partially extracted; engine is not.

---

## 2. BILLING LOGIC INVENTORY

### 2.1 Cart / line-item state shape

**Type:** `CartItem` — `src/pages/POSSales.tsx:176–207`

```ts
interface CartItem {
  id: string;
  barcode: string;
  productName: string;
  baseProductName?: string;
  size: string;
  color: string;
  quantity: number;
  mrp: number;
  originalMrp: number | null;
  gstPer: number;
  purchaseGstPer?: number;
  discountPercent: number;
  discountAmount: number;
  unitCost: number;
  rateAuthority?: "unit" | "discount";
  netAmount: number;
  productId: string;
  variantId: string;
  hsnCode?: string;
  productType?: string;
  isDcProduct?: boolean;
  uom?: string;
  showDiscount?: boolean;
  itemNotes?: string | null;
}
```

**State:** `items: CartItem[]` `596–607`. Persistence: `PosCartSnapshot` in `src/lib/posCartPersistence.ts` (items typed `unknown[]`).  
**Save-hook duplicate:** narrower `CartItem` in `src/hooks/useSaveSale.tsx:38–55` — POS still passes full cart objects.  
**Closures:** N/A (type only).

---

### 2.2 Add product to cart (incl. barcode)

| Piece | Location | Signature / role |
|-------|----------|------------------|
| Barcode entry | `2156–2280` | `handleSearch`, `handleBarcodeInputChange` → `searchAndAddProduct` |
| Scanner hook | ~`925–934` | `useBarcodeScanner` |
| Core add | `2534–2730` | `async function searchAndAddProduct(searchTerm: string)` |
| Cart mutate | `2857–3125` | `addItemToCart(product, variant, overridePrice?, addSource?)` |
| Quick service | `2732–2855` | `handleQuickServiceAdd` |
| Line net | `244–249` | `calculatePosCartLineNet(item)` |
| Garment GST | `493–508` | `applyPosGarmentGstToItem(item, garmentGstSettings)` |

**`handleBarcodeScan`:** **NOT FOUND** (name unused; path is `searchAndAddProduct`).

**Closes over (add path):** `currentOrganization`, `selectedProductType`, `itemsRef`/`setItems`, `settingsData` / `posRuntimeSettingsRef`, `garmentGstSettings`, `customerId`, `getBrandDiscountForProduct`, `checkStock`, toast/beep/focus helpers, dialog setters (`showPriceSelectionDialog`, stock issue, quick service).

---

### 2.3 Edit unit price, qty, delete line

| Action | Fn | Lines | Signature |
|--------|-----|-------|-----------|
| Delete | `removeItem` | `3137–3141` | `(index: number) => void` |
| Qty | `updateQuantity` | `3143–3164` | `async (index, newQty) => void` — `clampQty`, stock check, `calculatePosCartLineNet` |
| Unit price | `applyUnitPriceToCart` / `requestUnitPriceCommit` | `3283–3345` | Sets `rateAuthority: "unit"`, clears Disc%, garment GST; confirm if % off > setting |
| MRP | `updateMrp` | `3347–3378` | |
| GST % | `updateGstPer` | `3380–3386` | |

**Closes over:** `setItems`, `items`, `garmentGstSettings`, `canEditPosUnitPrice`, `posUnitPriceOverrideConfirmPct`, toast / `unitPriceConfirm` setters, `checkStock` (qty).

---

### 2.4 Line-level discount and bill-level flat discount

**Line:**
- Editors: `updateDiscountPercent` `3180–3218`, `updateDiscountAmount` `3220–3259`
- Formula (always): Disc% + Disc₹ + `(mrp - unitCost)*qty` in `calculatePosCartLineNet` `244–249`
- Cap vs bill: `maxLine = mrpTotal - flatDiscountAmount` `3196–3198`, `3237–3239`

**Bill flat:**
- State: `flatDiscountValue`, `flatDiscountMode` `608–609`
- Input: `handleFlatDiscountValueChange` `719–724` (whole-rupee normalize)
- Amount: `computePosFlatDiscount` — `src/utils/posGstTotals.ts:27–48`
- Cap: `maxFlatDiscountForGross` `3413–3417`

**Closes over (editors):** `setItems`, `items`, `flatDiscountAmount` (from render), toast.

---

### 2.5 `maxCombinedDiscountForGross` and `maxLine`

**Definition:** `src/utils/saleSettlement.ts:652–654`
```ts
export function maxCombinedDiscountForGross(grossAmount: number): number
```
Returns `Math.max(0, roundMoney2(grossAmount))`. Pure; no closures.

**`maxLine` (local, not exported):** `mrpTotal - flatDiscountAmount` inside discount editors `3197`, `3238`, `3276`.

**Usages:** toast messages `3213`, `3254`, `7212`, `7226`; flat cap `3413–3417`; save-time `normalizeDiscountsAgainstGross` via `useSaveSale` `applyBillCaps` / `applyDiscountGrossCap` (~`128–146`, `659`).

---

### 2.6 Tax computation (inclusive vs exclusive)

| Piece | Location |
|-------|----------|
| State `taxType` | `1426–1428` |
| Per-line display | `posLineDisplayTotal` — `posGstTotals.ts:15–24` |
| Bill GST | `computePosBillGst` — `posGstTotals.ts:51–67` (exclusive only; inclusive → `totalGst: 0`) |
| Payable | `3426–3436` |
| Garment rule | `applyPosGarmentGstToItem` → `resolveGarmentGstForLine` (`gstRules.ts:124`) |
| Persist | `sales.tax_type` in `useSaveSale.tsx:769` |

**CGST/SGST/IGST split on POS bill:** **NOT FOUND** in POSSales / useSaveSale write path (report-side only, e.g. `gstRegisterUtils.ts`).

**Closes over:** `taxType`, `items`, `flatDiscountAmount` for bill GST.

---

### 2.7 `gross_amount` / `discount_amount` / `net_amount`

Built each render at `3388–3478` (not `useMemo`):

| Concept | Formula | Lines |
|---------|---------|-------|
| Gross | `Σ mrp × qty` → save as `grossAmount` | `3391`, save ~`3839` |
| Line discount | % + ₹ + MRP−unit gap | `3392–3397` |
| Subtotal | `Σ netAmount` | `3398` |
| Flat | after line, capped | `3406–3417` |
| Payable pre-round | excl: taxable − flat − SR − credit + GST; incl: subtotal − flat − SR − credit | `3429–3436` |
| Net / final | `amountBeforeRoundOff + roundOff - points` | `3478` |

**Closes over:** `items`, `flatDiscountValue/Mode`, `saleReturnAdjust`, `creditApplied`, `taxType`, `roundOff`, `pointsToRedeem` (+ points helpers).

---

### 2.8 Round-off logic

| Step | Lines |
|------|-------|
| Auto | `calculatedRoundOff = Math.round(amountBeforeRoundOff) - amountBeforeRoundOff` `3439` |
| Sync effect | `3442–3453` unless `isManualRoundOff` |
| Manual | `handleRoundOffChange` `3456–3459` |
| Reverse from final | `handleFinalAmountChange` `3462–3466` |
| Reset | `handleResetRoundOff` `3469–3472` |
| Persist | `saleData.roundOff` → `sales.round_off`; line `round_off_share` in `useSaveSale.tsx:795–820` |

---

### 2.9 Invoice number generation

| Phase | Location | Mechanism |
|-------|----------|-----------|
| Preview only | `POSSales.tsx` ~`1753–1830` | Query recent `sales.sale_number`; sets `nextInvoicePreview` — **does not allocate** |
| POS allocate | `useSaveSale.tsx:698–711` | Custom `pos_numbering_format` / `pos_series_start` via `generateOrgSaleNumber`, else RPC **`generate_pos_number_atomic`** |
| Sale allocate | `useSaveSale.tsx:712–724` | `invoice_numbering_format` / RPC **`generate_sale_number_atomic`** |
| Hold | `useSaveSale.tsx` ~`1849–1852` | RPC **`generate_hold_number_atomic`** (or client `Hold/YY-YY/N` fallback) |
| Resume held | `resumeHeldSale` ~`1979–1991` | New POS number; overwrites `sales.sale_number` |

Helper: `generateOrgSaleNumber` — `src/utils/saleNumber.ts:46–99`.

---

### 2.10 Save path

**Mechanism:** Direct Supabase client inserts/updates (+ RPCs for numbering / voucher numbers). **Not** a single “save sale” RPC. **Not** an edge function for the bill body.

**API:** `useSaveSale` returns `{ saveSale, updateSale, holdSale, resumeHeldSale, isSaving }` — `useSaveSale.tsx:2133` (approx; export at end of hook).

**`saveSale` signature** (`566–578`):
```ts
saveSale(
  saleData: SaleData,
  paymentMethod: 'cash'|'card'|'upi'|'multiple'|'pay_later',
  paymentBreakdown?,
  saleType: 'pos'|'sale_invoice' = 'pos',
  runtimeOptions?,
)
```

**Transactional?** **No.** Sequence: insert `sales` → chunk-insert `sale_items` → best-effort ledger / SR / points / WhatsApp. On item-insert failure: soft-delete/cancel sale + delete items (`~1220–1230`). Not a DB transaction across tables.

**Tables written (happy path create):**

| Table | Op |
|-------|-----|
| `sales` | insert `743–775` |
| `sale_items` | insert chunks `826` |
| `customer_ledger_entries` | fire-and-forget via ledger helpers |
| `sale_returns` / `credit_notes` | if S/R adjust consumed |
| `voucher_entries` | exchange refund / finance (callers) |
| journal (accounting) | background if engine on |
| Edge (post-save, non-blocking) | `send-whatsapp`, `generate-einvoice` |

Stock: DB triggers on `sale_items` (comment near `1257`).

**`updateSale`:** delete all `sale_items` → re-insert → update `sales` — also **not** transactional (`1258–1722`).

**POS callers:** `handleSaveSale` `3804+`; `handlePaymentAndPrint` `4036+`; mix `4243+` → `saveSale` / `updateSale` / `resumeHeldSale`.

**Hook closes over:** `user`, `currentOrganization`, `toast`, points helpers, `queryClient`, `shopName`, `orgSettings`, `accountingEngineOn`, `savingLockRef`.

---

### 2.11 Hold bill / resume bill

| Action | UI | Hook |
|--------|-----|------|
| Hold | `handleHoldBill` `5335–5374` | `holdSale` `1725–1917` — insert `sales` with `payment_status: 'hold'`, cart in `held_cart_data` JSON, **no** `sale_items` → **no stock** |
| Resume into cart | `handleResumeHeldBill` `5295–5317` | may hold current cart, then `loadSaleForEdit` |
| Complete payment | payment handlers | `resumeHeldSale` `1920–2131` — insert items, new POS number, set payment |
| Hold list | query ~`1888–1907` | `isHoldLikeBill` `1876–1886` |

---

### 2.12 Edit-existing-bill path + `resolveBillFlatForPosEdit`

**Entry:** URL `?saleId=` → `loadSaleForEdit` `1126–1314` (effect ~`959–967`).

**`resolveBillFlatForPosEdit`** — `295–335`:
```ts
function resolveBillFlatForPosEdit(
  sale: SaleRowForFlatResolve,
  saleItems: SaleItemRowForFlatResolve[],
): { value: number; mode: "percent" | "amount"; percentLooksClean: boolean }
```
Pure module function; no closures. Priority: clean `flat_discount_percent` → `flat_discount_amount` → line `per_qty_net` implied flat → legacy header `discount_amount` → zero.

Called from `loadSaleForEdit` `1208` and `loadInvoice` `5054`.

**Edit save:** `updateSale` (or `resumeHeldSale` if held). Metadata-only: `handleSaveMetadataChanges` ~`1709`.

---

## 3. SETTINGS DEPENDENCIES

### 3.1 `POSSales.tsx`

| Key path | Line(s) | Default / coercion |
|----------|---------|--------------------|
| `sale_settings` (object) | `1324`, `1382`, `1573–1574`, `1759`, `4942` | `\|\| {}` |
| `sale_settings.pos_barcode_price_mode` | `1327` | `'mrp'` iff `=== 'mrp'`, else **`'sale_price'`** |
| `purchase_settings` (object) | `1325` | `\|\| {}` |
| `purchase_settings.show_mrp` | `1328` | `=== true` → runtime `enable_mrp` (**aliased**) |
| `purchase_settings.garment_gst_rule_enabled` | `1347` | `=== true` |
| `purchase_settings.garment_gst_threshold` | `1348` | passed through (default inside `gstRules`) |
| `sale_settings.pos_allow_date_change` | `1352` | `=== true` |
| `sale_settings.allow_pos_edit_unit_price` | `1356` | `=== true` |
| `sale_settings.pos_unit_price_override_confirm_pct` | `1358–1360` | non-finite → **30**; clamp **1–99** |
| `sale_settings.pos_bill_format` | `1384` | `\|\| 'thermal'` |
| `sale_settings.invoice_template` | `1386` | `\|\| 'professional'` |
| `sale_settings.invoice_paper_format` | `1390` | via `resolvePosBillFormat` |
| `sale_settings.show_invoice_preview` | `1425` | `?? true` |
| `sale_settings.default_tax_type` | `1427–1428` | `'exclusive'` iff exact; else **`'inclusive'`** |
| `sale_settings.default_discount` | `1575–1577` | truthy → flat **percent** |
| `sale_settings.default_payment_method` | `1580–1584` | `.toLowerCase()` when empty cart |
| `sale_settings.pos_numbering_format` | `1762–1763` | **dual-read** with `pos_series_start` |
| `sale_settings.pos_series_start` | `1762–1764` | format fallback + series |
| `sale_settings.ask_price_on_scan` | `2968` | `?? true` |
| `product_settings.service_quick_entry_dialog` | `2876` | `!== false` → default true |
| `bill_barcode_settings` (→ `useDirectPrint`) | `1438` | hook reads enable/auto/printer/paper/copies |
| `bill_barcode_settings.direct_print_pos_paper` | `1394`, `1450`, `3749`, `4855` | thermal/direct paper |
| `bill_barcode_settings.enable_cash_drawer` | `1461`, `4726`, `4874` | truthy |
| `bill_barcode_settings.cash_drawer_pin` | `1462`, `4727`, `4875` | `\|\| 'pin2'` |

**Dual / aliased names:**
- Numbering: `pos_numbering_format` **\|\|** `pos_series_start` (`1763`).
- MRP flag: stored `purchase_settings.show_mrp`, consumed as `enable_mrp` (`1328–1339`).

WhatsApp: `useWhatsAppAPI()` `554` — not `settingsData` keys.

### 3.2 `SalesInvoice.tsx`

| Key path | Line(s) | Default / coercion |
|----------|---------|--------------------|
| `accounting_engine_enabled` (top-level) | `867` | via `isAccountingEngineEnabled` |
| `purchase_settings.garment_gst_rule_enabled` | `871` | `=== true` |
| `purchase_settings.garment_gst_threshold` | `872` | passed through |
| `sale_settings.enable_size_grid_sales` | `879` | `!== false` → default true |
| `sale_settings.default_tax_type` | `890–891` | same exclusive/inclusive rule as POS |
| `sale_settings.invoice_numbering_format` | `1018–1019` | **dual-read** with `invoice_series_start` |
| `sale_settings.invoice_series_start` | `1018–1020` | format fallback + series |
| `sale_settings.enable_customer_price_memory` | `2010` | `?? false` |
| `sale_settings.ask_price_on_scan` | `2029` | `?? true` |
| `sale_settings.shop_logo_path` | `2749` | truthy → signed URL |
| `sale_settings.invoice_paper_format` | `3298` | WA |
| `sale_settings.sales_bill_format` | `3299`, `3468` | WA; print `\|\| 'a4'` |
| `sale_settings.pos_bill_format` | `3300` | WA payload only |
| `sale_settings.invoice_template` | `3301` | WA |
| `bill_barcode_settings` (→ `useDirectPrint`) | `896` | same hook pattern |
| `bill_barcode_settings.bill_header` | `2738` | `\|\|` long default string |
| `bill_barcode_settings.bill_footer` | `2739` | `\|\| ''` then hardcoded terms |
| Top-level `business_name` / `address` / `mobile_number` / `email_id` / `gst_number` | `2804–2808` | string defaults |

**Sale does not read:** `pos_barcode_price_mode`, `show_mrp`, `pos_allow_date_change`, `allow_pos_edit_unit_price`, POS numbering keys, `default_discount`, `default_payment_method`, cash-drawer keys.

---

## 4. POS vs SALE OVERLAP (highest priority)

POS and Sale recompute the same money concepts with **different code**. Shared utils cover garment GST + POS flat/GST helpers + settlement caps; Sale Invoice largely inlines math and **bypasses** discount/S/R caps on save.

### Divergence index

| # | Concept | POS | SALE | Verdict |
|---|---------|-----|------|---------|
| 1 | **Line net base** | `mrp × qty` then Disc%+₹+(MRP−unit)×qty — `POSSales.tsx:244–249` | `salePrice × getMtrMultiplier` then % XOR ₹ + 2dp rounds — `SalesInvoice.tsx:2373–2402` | **Different formulas** |
| 2 | **Line disc stacking** | Formula allows % + ₹ + rate gap | Strict % XOR ₹ | **Disagree** |
| 3 | **Exclusive GST on line** | `netAmount` stays taxable; GST at bill — `posGstTotals.ts:51–67` | Exclusive bakes GST into `lineTotal` — `2392–2394` | **Disagree** |
| 4 | **Flat discount modes** | Exclusive mode percent\|amount — `608–609`, `posGstTotals.ts:27–48` | **Stacked** `%` + ₹ — `3519–3520` | **Disagree** |
| 5 | **Flat % base** | `(mrpTotal − saleReturnAdjust)` — `posGstTotals.ts:33–36` | Raw `grossAmount` (sale-price), no S/R — `3519` | **Disagree** |
| 6 | **Discount caps** | UI + `maxCombinedDiscountForGross` `3413–3417` + `useSaveSale` normalize | **None** in UI/save | **Sale can over-discount** |
| 7 | **Bill GST allocation base** | Share by `netAmount / taxableSubtotal` — `posGstTotals.ts:60–64` | Share by `(salePrice×mult − disc) / gross` — `3524–3528` | **Disagree** (comment at `posGstTotals.ts:50` claims match — **false when bases differ**) |
| 8 | **Inclusive GST display** | Not extracted into payable | Extracted for display `3529–3531` | Display-only diverge |
| 9 | **Gross header** | `Σ mrp×qty` `3391` | `Σ salePrice×mtr` `3509` | **Disagree** |
| 10 | **Other charges** | Absent | `+ otherCharges` `3522` | Sale-only |
| 11 | **S/R + credit in payable** | Yes `3432–3436` | Not in totals; SR only read on edit payment status `3072–3078` | **Disagree** |
| 12 | **Points vs round-off order** | Points **after** round-off `3478` | Points **before** round-off `3540` | **Can change final ₹** |
| 13 | **Final net rounding** | `finalAmount` keeps paise after auto round-to-rupee | `Math.round(netBeforeRoundOff + roundOff)` forces whole rupees `3560` | **Disagree** |
| 14 | **Round-off on edit** | Auto continues unless manual `3442–3453` | Auto **skipped** when `editingInvoiceId` `3547` | **Disagree** |
| 15 | **`unit_price` meaning** | `unitCost` (rate) via `useSaveSale:811` | `salePrice` `2996`/`3197` | Semantic diverge |
| 16 | **Save path** | Capped `useSaveSale` + share columns | Direct Supabase, uncapped, no share columns | **Disagree** |
| 17 | **Flat restore on edit** | `resolveBillFlatForPosEdit` `295–335` | `resolveFlatDiscountFromSale` `245–291` | Two different helpers |
| 18 | **CGST/SGST/IGST** | Neither writes on save | Neither | N/A for extraction; reports only |

### Same shared util (aligned)

- Garment GST: both call `resolveGarmentGstForLine` (`gstRules.ts:124`) — but **effective unit price** differs (POS post-line-net/qty `493–507` vs Sale after-line-disc/mult `2380–2387`).
- Points helpers: both use `useCustomerPoints` / `calculateRedemptionValue`.

**Extraction implication:** Do **not** assume Sale Invoice math is interchangeable with POS. Mobile POS should lift **POS** pipeline (`calculatePosCartLineNet` → `computePosFlatDiscount` → `computePosBillGst` → round/points → `useSaveSale`), not Sale’s inline totals.

---

## 5. PDF / PRINT PATH

### 5.1 Entry points from POS

Imports: `POSSales.tsx:154–162` — `printInvoicePDF`, `generateInvoiceFromHTML`, `printInvoiceDirectly`, `printA5BillFormat`, `generateInvoiceBase64` from `pdfGenerator`; plus `captureElementToPdfBase64`, `useReactToPrint`, `useDirectPrint`.

| Path | Entry | Called? | Data source | Output |
|------|-------|---------|-------------|--------|
| A Browser print | `handlePrint = useReactToPrint` `4708–4736` | **YES** | State → `InvoiceWrapper` via `renderPosPrintSource` `4754–4843` / `invoicePrintRef` | Print dialog (iframe + print) |
| B Direct print | `directPrint(...)` via `useDirectPrint` `1437–1452` | **YES** (Electron silent; else fallback A) | Rendered DOM HTML | Electron print / browser fallback |
| C Preview dialog | `PrintPreviewDialog` ~`7797` | **YES** | State `savedInvoiceData` | UI; download via `deliverPdfBlob` |
| D WhatsApp PDF | `generateInvoiceBase64` `5491`/`5520`; `captureElementToPdfBase64` `3584–3645` | **YES** | Live DOM or state snapshot | **base64 string** (no data-URL prefix for Meta path) |
| `printInvoicePDF` / `generateInvoiceFromHTML` / `printInvoiceDirectly` / `printA5BillFormat` | imported `154` | **NOT FOUND** as calls in POSSales (dead imports) | — | — |

**`InvoicePrint` component** (`src/components/InvoicePrint.tsx:57`): **NOT FOUND** imported by POSSales. POS uses **`InvoiceWrapper`**.

### 5.2 Props / data source (exact answer)

- Line items / totals / customer on print: **component state** (`savedInvoiceData` / cart) — **does not re-query sale by id** for the POS print path.
- Org branding / template: `InvoiceWrapper` **re-queries** org settings by `organization_id` (`InvoiceWrapper.tsx` ~`184–186`).
- Contrast: `MobileSalePrintPreviewDialog` **does** re-query by `saleId` via `fetchSaleForInvoicePreview` — separate from POSSales live path.

### 5.3 Output types

- Browser print: print window / iframe (react-to-print).
- WhatsApp: base64 string from html2canvas + jsPDF (`pdfGenerator.tsx:791–832`, `captureInvoicePdf.ts:44–76`).
- Preview download: **Blob** → `deliverPdfBlob` (`mobileDocumentDelivery.ts:9–54`).
- Server PDF response: **NOT FOUND** for POS bill print.

### 5.4 WebView hazards

| Mechanism | Where | Risk |
|-----------|-------|------|
| `window.print` | `appPrint.ts:97,100`; react-to-print iframe | Often broken in Android WebView |
| `window.open` | `pdfGenerator` print helpers; `mobileDocumentDelivery.ts:35` | Popup / WebView policy |
| Fixed px canvas | `printA5BillFormat` ~`675–676` (559×794) | Dead for POS today; would hard-size |
| html2canvas | WhatsApp paths | Memory / layout on phones |
| Native Filesystem/Share | **NOT FOUND** | `deliverPdfBlob` uses Web Share / open / `<a download>` only `mobileDocumentDelivery.ts:17–53` |

---

## 6. CAPACITOR / MOBILE SHELL

### 6.1 `capacitor.config.ts`

| Key | Value | Line |
|-----|-------|------|
| `PRODUCTION_HOST` | `"https://app.inventoryshop.in"` | `3` |
| `server.url` | `serverUrl` → host or `host/{orgSlug}` | `11`, `20–26` |
| `webDir` | `dist` | `16` |
| `androidScheme` | `https` | `21` |
| `cleartext` | `false` | `23` |
| `errorPath` | `native-load-error.html` | `25` |
| SplashScreen | `launchAutoHide: false`, remote-shell comment | `28–38` |

**Confirmed:** APK loads remote content from **`https://app.inventoryshop.in`**.

### 6.2 Capacitor plugins in `package.json`

**Installed:** `@capacitor/android`, `@capacitor/app`, `@capacitor/core`, `@capacitor/keyboard`, `@capacitor/network`, `@capacitor/splash-screen`, `@capacitor/status-bar` (deps ~`100–106`); `@capacitor/cli` (dev).

| Plugin | Installed? |
|--------|------------|
| `@capacitor/filesystem` | **NO** |
| `@capacitor/share` | **NO** |
| `@capacitor/camera` | **NO** |
| Capacitor barcode-scanner | **NO** |

### 6.3 Native plugin calls from remote context

**Yes** — same JS bundle in WebView at `app.inventoryshop.in` calls Capacitor when `Capacitor.isNativePlatform()`:

| Example | File:line |
|---------|-----------|
| Shell init | `src/main.tsx:23` → `initNativeShell()` |
| StatusBar / Keyboard / SplashScreen | `src/hooks/useNativeApp.ts:34–57` |
| App.exitApp / backButton | `src/hooks/useNativeApp.ts:83–100` |
| Network status | `src/hooks/useOfflineSync.tsx:89–99` |
| Bridge mount | `NativeAppBridge` via `App.tsx` |

**NOT FOUND:** `@capacitor/filesystem`, `@capacitor/share`, native Camera/BarcodeScanner plugin calls.

**Implication for Phase 3:** Plugin bridge works for installed plugins from remote URL. PDF share path is **unproven** with native Filesystem/Share (not installed); current path is Web Share API / `window.open` (`mobileDocumentDelivery.ts:17–40`).

### 6.4 Camera / barcode

| Kind | Present? | Detail |
|------|----------|--------|
| Capacitor Camera / Barcode plugin | **NO** | not in `package.json` |
| Web camera barcode | **YES** | `html5-qrcode` (`package.json:156`) via `CameraBarcodeScannerDialog` |
| Hardware wedge | **YES** | `useBarcodeScanner` keystroke detector |

---

## 7. EXISTING MOBILE PATTERNS

### 7.1 `useIsMobile`

**Defined:** `src/hooks/use-mobile.tsx:110–128`  
Breakpoint: `MOBILE_BREAKPOINT = 768` (`5`). Returns `window.innerWidth < 768` unless force-desktop (`29–32`). Does **not** force true on native Capacitor by itself.

Related: `useIsTablet` `150–169` (iPad / coarse pointer &lt; 1180), `useCompactLoginLayout` `130–148` (native → compact).

### 7.2 `useIsMobile` consumers (non-exhaustive list from repo)

`POSSales.tsx`, `SalesInvoice.tsx`, `POSDashboard.tsx`, `SalesInvoiceDashboard.tsx`, `PurchaseEntry.tsx`, `PurchaseBillDashboard.tsx`, `StockReport.tsx`, `CustomerMaster.tsx`, `Accounts.tsx`, `PaymentsDashboard.tsx`, `SaleReturnDashboard.tsx`, `DailySaleAnalysis.tsx`, `DailyCashierReport.tsx`, `OutstandingDashboardTab.tsx`, `CustomerPaymentTab.tsx`, `CustomerLedger.tsx`, `CustomerHistoryDialog.tsx`, `InvoiceHistoryDialog.tsx`, `CreditNoteHistoryDialog.tsx`, `AdaptiveCustomerPicker.tsx`, `AdaptiveSupplierPicker.tsx`, `AdaptivePaymentMethodPicker.tsx`, `MobileOrgIndexRedirect.tsx`, `sidebar.tsx`.

### 7.3 Mobile shell structure

| Piece | Location | Behavior |
|-------|----------|----------|
| Org index redirect | `MobileOrgIndexRedirect.tsx:24–46` | Native **or** `useIsMobile` → `mobile-dashboard` landing |
| Routed home | `MobileDashboardPage.tsx:5–9` | `FullScreenLayout` + **`OwnerDashboard`** (not `MobileDashboard` component) |
| `MobileDashboard` component | `components/mobile/MobileDashboard.tsx:70` | Alternate KPI UI; not the routed home |
| Shell | `FullScreenLayout` + `lib/mobileShell.ts` | `h-dvh`, inset, `MobileAppHeader` (`safe-area-pt`), `OwnerBottomNav` (`safe-area-pb`) |
| Safe-area CSS | `index.css` ~`.safe-area-pb` / `.safe-area-pt` / `.safe-area-inset` | `env(safe-area-inset-*)` |
| POS route | `App.tsx` ~`901–905` | `pos-sales` → lazy `POSSales` (same page; branches to `MobilePOSLayout` at `5811`) |
| Existing mobile POS chrome | `MobilePOSLayout.tsx`, `MobilePOSCartItem.tsx`, `MobilePOSBottomBar.tsx`, `MobilePOSPaymentSheet.tsx`, `MobilePOSHeader.tsx` | Presentational; engine still in `POSSales` |

---

## 8. EXTRACTION VERDICT

### 8.1 Classification (section 2 items)

| Item | Class | Blockers / notes |
|------|-------|------------------|
| `CartItem` type + cart state shape | **PURE** (type) / **ENTANGLED** (state in 8k component) | Lift type to shared module; state → hook |
| `calculatePosCartLineNet`, `posLineNetUnitPrice`, `applyPosGarmentGstToItem`, `resolveBillFlatForPosEdit` | **PURE** | Already module-level in POSSales — move file only |
| `computePosFlatDiscount`, `computePosBillGst`, `posLineDisplayTotal` | **PURE** | Already in `posGstTotals.ts` |
| `maxCombinedDiscountForGross` / normalize helpers | **PURE** | Already in `saleSettlement.ts` |
| Add-to-cart / barcode (`searchAndAddProduct`, `addItemToCart`) | **ENTANGLED** | Stock validation, toasts, beeps, dialogs, brand discount, settings, focus |
| Edit qty / price / disc / delete | **ENTANGLED** | Cap toasts + confirm dialogs + stock |
| Totals / flat / GST / round / points pipeline | **PURE** (math) / **ENTANGLED** (lives inline in render + effect for round-off) | Extract as pure `computePosBillTotals(input)` |
| Invoice number generation | **PURE** (in `useSaveSale` / `saleNumber.ts`) | Already headless |
| Save / update / hold / resume | **PURE** relative to UI (`useSaveSale`) | Already headless; keep using it |
| Hold/resume UI wiring | **ENTANGLED** | Dialogs + `loadSaleForEdit` |
| Edit-existing-bill load | **ENTANGLED** | Maps DB → cart + UI flags + print snapshot |
| Print / PDF / WhatsApp | **UI-ONLY** (+ DOM) | Not billing engine; separate Phase 3 |
| Desktop/tablet/mobile JSX | **UI-ONLY** | `MobilePOSLayout` already exists |

### 8.2 Dependency order → headless `usePosBilling`

Suggested move order (dependencies first):

1. **Shared types** — `CartItem`, flat-discount mode, `PosBillTotalsInput` / result  
2. **Line math** — `calculatePosCartLineNet`, `posLineNetUnitPrice`, `applyPosGarmentGstToItem` (from POSSales module scope)  
3. **Bill math** — wrap existing `computePosFlatDiscount` + `computePosBillGst` + round-off + points order into `computePosBillTotals` (encode POS order: round then points)  
4. **Discount caps** — reuse `maxCombinedDiscountForGross` / `normalizeDiscountsAgainstGross`  
5. **Edit restore** — `resolveBillFlatForPosEdit`  
6. **Cart mutators (pure core)** — `applyAddLine`, `applyQty`, `applyUnitPrice`, `applyLineDiscount` returning new `CartItem[]` (strip toast/DOM)  
7. **`usePosBilling` hook** — owns `items`, flat, SR, credit, taxType, roundOff, points; exposes totals + mutators; calls into stock/brand as injected deps  
8. **Keep outside hook** — `useSaveSale`, print/PDF, keyboard F-keys, layout shells  
9. **Do not merge Sale Invoice math** until §4 divergences are explicitly product-decided

---

## 9. RISKS — mobile `net_amount` ≠ desktop

Anything that can make a mobile bill produce a different `net_amount` than desktop for the same inputs:

1. **Reusing Sale Invoice formulas on mobile** — different gross base (sale price vs MRP), flat stacking, GST bake-in, points/round order (`§4` #1–13). Highest risk if “shared billing” is naively unified.
2. **Points vs round-off order** — POS: `finalAmount = amountBeforeRoundOff + roundOff - points` (`3478`). Sale: points before round, then `Math.round` (`3540`, `3560`). Wrong order → different rupee.
3. **Tax type default / exclusive GST path** — must call `computePosBillGst` with same `taxType`; exclusive adds GST after flat allocation (`3429–3435`).
4. **Flat discount mode** — percent vs amount + cap `maxFlatDiscountForGross` (`3413–3417`); skipping cap inflates discount / deflates net.
5. **Implicit MRP−unit discount** — must include in line net and `totals.discount` (`244–248`, `3392–3396`); mobile UI that “bills at unit only” without gap would diverge.
6. **Sale return adjust + credit applied** — subtracted in POS payable (`3432–3436`); omitting either changes net.
7. **`useSaveSale.applyBillCaps`** — save-time normalize can lift net if UI sent over-discount (`659`); mobile must send through same hook, not direct inserts.
8. **Garment GST threshold** — missing `purchase_settings` → wrong `gstPer` → exclusive GST wrong.
9. **Floating-point / whole-rupee flat input** — POS flat input normalizes whole rupees (`719–724`); free-typing paise on mobile could diverge.
10. **Edit reload via `resolveBillFlatForPosEdit`** — wrong restore of flat changes subsequent edits’ net (`295–335`, `1208`).
11. **Print/PDF path** — does not change DB `net_amount`, but html2canvas from a different layout DOM can show a different printable total if props diverge from cart state (state vs re-query mismatch).
12. **§6 PDF share unproven** — not a `net_amount` risk, but Phase 3 delivery risk: without Filesystem/Share plugins, prove `deliverPdfBlob` / WhatsApp base64 on real WebView before scoping native share.

---

## Appendix — Key file index

| File | Role |
|------|------|
| `src/pages/POSSales.tsx` | Monolith POS UI + cart + totals |
| `src/pages/SalesInvoice.tsx` | Parallel Sale engine (divergent math) |
| `src/hooks/useSaveSale.tsx` | Persist POS/Sale create/update/hold/resume |
| `src/utils/posGstTotals.ts` | Flat + bill GST |
| `src/utils/saleSettlement.ts` | Discount/S/R caps, payment derive |
| `src/utils/gstRules.ts` | Garment GST |
| `src/utils/saleNumber.ts` | Number generation wrappers |
| `src/utils/pdfGenerator.tsx` | PDF/print helpers (mostly unused by POS except base64) |
| `src/utils/mobileDocumentDelivery.ts` | Blob share/download without Cap Filesystem/Share |
| `src/components/mobile/MobilePOS*.tsx` | Existing mobile POS chrome |
| `capacitor.config.ts` | Remote shell → `app.inventoryshop.in` |
