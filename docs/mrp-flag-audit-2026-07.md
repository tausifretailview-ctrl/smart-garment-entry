# MRP flag audit — POS billing — 2026-07

Phase 0 applied. Phase 1 investigation only — **no POS application changes until a 1D choice**.

---

## Phase 0 — `InvoicePrint.tsx` (done)

**File:** `src/components/InvoicePrint.tsx` (~300)

**What was wrong**
1. Labelled `MRP TOTAL` but rendered `subTotal` — the same figure already printed as `TOTAL` two lines above.
2. Ungated by every MRP setting.

**What's in scope:** `InvoicePrintProps` / `InvoiceItem` expose `subTotal`, `discount`, `grandTotal`, and line `sp` / `rate` / `total`. **No MRP field and no MRP sum.**

**Fix chosen:** **Removed the line** (did not gate-and-still-print `subTotal`). Gating on `sale_settings.show_mrp_column` (as `InvoiceWrapper.tsx:319` does for real templates) would still show a false MRP figure when the toggle is on. Inventing a sum was forbidden.

---

## Four overlapping MRP settings (confirmed)

| Setting | Where written | Typical readers |
|---------|---------------|-----------------|
| `purchase_settings.show_mrp` | Settings “Enable MRP Field” (~2135); description claims Product Entry, Sales, POS, Reports, Print | POS → `enable_mrp` (`POSSales.tsx:1310`); Product Entry / Purchase Entry / ProductDashboard show-MRP UI |
| `sale_settings.show_mrp_column` | Settings “Show MRP Column” (~3818) | `InvoiceWrapper.tsx:319` → print templates; SalesInvoiceDashboard / Quotation print props; MobileSalePrintPreview |
| `sale_settings.show_item_mrp` | (sale settings; fallback to `show_mrp_column`) | `POSDashboard.tsx:521`, `SalesInvoiceDashboard.tsx:1044` (history / reprint item MRP) |
| `isColumnVisible("sales_invoice", "mrp")` | Column-visibility registry | `SalesInvoice.tsx:341` only — **follow-up; out of this task** |

POS billing display/math does **not** read `show_mrp_column` / `show_item_mrp` / the SalesInvoice registry. It only maps `purchase_settings.show_mrp` → `enable_mrp`, and even that is barely used (see 1A).

---

## 1A — Every MRP read on the POS path

### Runtime flag

| Site | Role | Respects `enable_mrp`? | Should? |
|------|------|------------------------|---------|
| `POSSales.tsx:1310` | `enable_mrp: purchaseSettings.show_mrp === true` | n/a (source) | — |
| `POSSales.tsx:2928` | `useMrpMode = enable_mrp && pos_barcode_price_mode === 'mrp'` | **yes** (+ barcode mode) | yes (price mode) |
| `POSSales.tsx:6860` | UI requiring `pos_barcode_price_mode === 'mrp' && enable_mrp` | **yes** | yes |

### Cart model & add-to-cart

| Site | Role | Respects `enable_mrp`? | Should? |
|------|------|------------------------|---------|
| `POSSales.tsx:184` | `originalMrp` on `CartItem` (“for savings”) | no | for display/savings when flag off: should not drive customer-facing savings |
| `POSSales.tsx:2961–3005` | `displayMrp` / `mrp` / `originalMrp` / `unitCost`; `useMrpAsPrice` only when `useMrpMode` | **partial** — price uses flag; **MRP fields still filled from product MRP when flag off** | pricing OK; stored line MRP for display/savings should follow flag policy (1D) |
| `POSSales.tsx:1212` | Draft restore: `originalMrp` if `mrp > unit_price` | no | same |
| `POSSales.tsx:2719`, `:2777` | Service / special lines: `originalMrp: null` | n/a | ok |
| `POSSales.tsx:504–516` `mapPosPrintItem` | Print line `mrp = max(originalMrp, mrp, taxableUnit)` | no | print should follow chosen policy |

### Arithmetic / discount cap (not cosmetic)

| Site | Role | Respects `enable_mrp`? | Should? |
|------|------|------------------------|---------|
| `POSSales.tsx:3102–3111` `sumLineDiscount` | Base = `item.mrp`; includes **implicit** `(mrp - unitCost) * qty` | no | depends on 1D — this is why “64% off” appears with ₹0 cashier discount |
| `POSSales.tsx:3113–3114` `sumMrpTotal` | Σ `mrp * qty` | no | see 1B |
| `POSSales.tsx:3127–3142`, `:3163–3178` | Line discount editors; cap via `mrpTotal` / `maxCombinedDiscountForGross(mrpTotal)` | no | **must not break** — 1B |
| `POSSales.tsx:3185–3193` `updateMrp` | Sets both `mrp` and `unitCost` | n/a | editing path |
| `POSSales.tsx:3205–3219` `totals.mrp` / `totals.discount` / `totals.savings` | Always from cart `mrp` | no | display should; maths per 1D |
| `POSSales.tsx:3222–3239` | Flat discount vs `totals.mrp` / `maxCombinedDiscountForGross(totals.mrp)` | no | 1B |
| `POSSales.tsx:3500–3501` | `totalDiscountDisplay`, `effectiveDiscountPercent = totalDiscount / totals.mrp` | no | drives “% off” badge |

`maxCombinedDiscountForGross` (`saleSettlement.ts:572–574`) returns **the gross itself** (100% of whatever basis is passed). Cap basis today = cart MRP total.

### Customer-facing UI (exact locations for the report)

| UI | File:line | Gated by `enable_mrp`? |
|----|-----------|------------------------|
| Footer **MRP Total** | `POSSales.tsx:6802–6806` | **no** |
| Footer **Savings** (“₹… · Saves N%”) | `POSSales.tsx:6808–6818` | **no** — shown when `totals.mrp > totals.subtotal \|\| totals.savings > 0` |
| Footer **Discount** ₹ | `POSSales.tsx:6831–6834` | n/a (real + implicit) |
| Struck-through **MRP ₹…** next to Net Amount | `POSSales.tsx:7184–7187` | **no** — when `totals.mrp > 0 && totals.mrp !== finalAmount` |
| **↓ N% off** under Net Amount | `POSSales.tsx:7197–7200` | **no** — when `effectiveDiscountPercent > 0` |
| Product search dropdown struck MRP | `POSSales.tsx:6119–6122` | **no** |
| Tablet strip “MRP ₹…” | `TabletPOSLayout.tsx:360`, `:460` | **no** (fed `totals.mrp`) |
| Mobile cart struck original MRP | `MobilePOSCartItem.tsx:104–107` | **no** |
| Mobile flat-discount helper uses `mrpTotal` prop | `MobilePOSBottomBar.tsx:106–111` | n/a (math) |

### Persist / print handoff (POS)

| Site | Role |
|------|------|
| `POSSales.tsx:3422`, `:7322` | Passes `mrp: item.originalMrp \|\| item.mrp` into save/print payloads |

---

## 1B — Discount-cap dependency (highest risk)

**Today**
- Line + flat discounts are capped against `sumMrpTotal` / `totals.mrp`.
- `sumLineDiscount` already counts the **MRP − unitCost** gap as discount (“implicit rate discount”).
- With flag **off**, barcode mode not MRP: `unitCost = sale_price` (e.g. 1440), `item.mrp = displayMrp` (e.g. 4000) → implicit discount 2560, savings UI fires, while payable stays ~1440.

**If Option A (display-only gate)**  
- Keep `mrpTotal` / implicit math unchanged.  
- Cap basis **unchanged** (still MRP gross).  
- Extra explicit discount room ≈ remaining sale-price value after implicit gap (same as today).  
- **Net amount unchanged.** Lowest risk.

**If Option B (bill from sale price when flag off)**  
- When flag off: treat line basis as sale price (`item.mrp` aligned to selling rate / no phantom MRP).  
- Cap basis becomes **sale-price gross**, not catalogue MRP.  
- Ceiling still holds (`maxCombinedDiscountForGross` = 100% of that basis) but the **numeric ceiling drops** vs today whenever MRP > sale price (cannot “discount” the phantom MRP gap because it no longer exists).  
- Payable for zero-cashier-discount bills should match today; over-limit boundary tests must use the **new** ceiling.  
- **Must not change how already-saved sales store totals** — only live cart behaviour when flag is off.

**If Option C (fix the promise only)**  
- Cap and fake savings **unchanged**. Cap risk: none. Customer-facing lie: remains until a separate display fix.

---

## 1C — Does POS actually price from MRP?

**Only when both are true:** `enable_mrp` **and** `pos_barcode_price_mode === 'mrp'` (`useMrpMode` / `useMrpAsPrice` at `POSSales.tsx:2928–3032`).

- **MRP mode on:** `unitCost = displayMrp` (MRP as rate); line % discounts from brand/product sale-discount suppressed (`discountPercent: 0`).
- **Otherwise (including Enable MRP Field off):** `unitCost = sale_price`; `item.mrp` still set to catalogue MRP for display/savings; `showDiscount` set when MRP > sale price.

The comment at ~3204–3215 (“POS bills from MRP”) is **overstated** — true only in MRP barcode mode. With the field “disabled”, POS **already prices from sale price**, but still **advertises** MRP-vs-sale as Savings / % off. That matches the shop report (unit 1440, MRP Total 4000, Saves 64%, no cashier discount).

Therefore “disable MRP field” **cannot** be assumed to be a pure Product-Entry toggle today, and a display-only fix (A) is coherent: pricing already left MRP when the flag is off; only the advertisement did not.

---

## 1D — Decision (stop here)

### Option A — Display-only gate *(recommended)*

Hide MRP Total, Savings, struck MRP, “% off”, and related cart/search MRP chrome when `enable_mrp` is false. **Keep** `mrpTotal` / implicit discount / cap maths as today.

- **Pros:** Stops lying to the customer; no change to payable or cap basis; smallest regression surface.  
- **Cons:** MRP remains in internal maths; Discount ₹ footer may still reflect the implicit MRP−sale gap unless that chip is also gated (recommend gating the Savings / % off / struck MRP / MRP Total; treat raw “Discount” chip carefully so real cashier discounts still show).  
- **Cap basis changes?** **No.**

### Option B — Bill from sale price when flag off

When flag off, align cart MRP basis with sale price (no phantom gap); remove savings display; cap against sale-price gross.

- **Pros:** Semantics match “MRP disabled”; no fake discount in maths either.  
- **Cons:** Cap ceiling changes; needs dedicated boundary tests; easier to accidentally touch persisted fields if save path copies `mrp`.  
- **Cap basis changes?** **Yes** — from catalogue MRP total to sale-price gross when flag is off.

### Option C — Fix the promise instead

Narrow Settings copy; expose POS MRP *display* as a separate sale setting. Optionally leave current POS behaviour until A/B.

- **Pros:** Honest UX for admins; no code risk to bills.  
- **Cons:** Does not fix the reported customer-facing bug by itself.  
- **Cap basis changes?** **No.**

### Recommendation

**Option A**, then optionally a small Settings copy fix (slice of C) so “Enable MRP Field” no longer claims it alone controls all print/Sales surfaces (`show_mrp_column` / registry remain separate).

Do **not** choose B until A is verified on a live till, unless you explicitly want the tighter sale-price discount ceiling when MRP is disabled.

---

## Follow-ups (not this task)

- Consolidate the four MRP settings (migration / settings UX risk).  
- `SalesInvoice.tsx` `isColumnVisible("sales_invoice", "mrp")` registry.  
- Product search / tablet / mobile MRP chrome when implementing A.  
- Whether footer “Discount” ₹ should exclude implicit MRP−sale gap when flag off (product call under A).

---

## Phase 2 progress

| Step | Status |
|------|--------|
| 1 Settings migration (14 null → `show_mrp: true`) | **Blocked here** — SQL ready in `docs/mrp-flag-step1/`; needs operator run (no service-role in this env). Stop before Step 2. |
| 2 Display gate (Option A) | Waiting on Step 1 approval + row count |
| 3 Persist sale-price gross when flag off | Waiting on Step 2 |

---

## Waiting

**Step 1:** Run `docs/mrp-flag-step1/` in production SQL Editor; report backup CSV + guard 0 + UPDATE 14. Then approve Step 2.
