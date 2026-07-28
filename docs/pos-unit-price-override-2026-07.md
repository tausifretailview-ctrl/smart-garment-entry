# POS unit price override — Phase 1 design

**Date:** 2026-07-28  
**Scope:** Design only. No code, no schema, no Phase 2.  
**File under design:** `src/pages/POSSales.tsx` (cart line math + UNIT PRICE cell)

---

## Prerequisite — MRP Step 2

MRP display is already gated on `enable_mrp` in current `POSSales.tsx`:

| Location | Status |
|----------|--------|
| `useMrpMode` (~2933) | `runtime?.enable_mrp === true && pos_barcode_price_mode === 'mrp'` |
| Rate override badge (~6614) | `enableMrp && mrp > unitCost` |
| Footer MRP-mode copy (~6876) | gated on `enable_mrp` |

`sumMrpTotal` / `savings` / totals.mrp remain in the discount-cap and savings paths. **Phase 2 must not edit those** (MRP Step 3 owns them). Phase 1 can proceed; **before Phase 2 coding, confirm no open MRP Step 2 PR still rewriting the same handlers.**

---

## Current model (facts)

Line net (`calculatePosCartLineNet`):

```text
base          = mrp × quantity
% disc        = base × discountPercent / 100
implicit rate = max(0, (mrp − unitCost) × quantity)
net           = base − % disc − discountAmount − implicit rate
```

- **Disc% / Disc Rs** are editable; they set `discountPercent` (amount maps into percent) and clear `discountAmount` after map.
- **UNIT PRICE** is `unitCost`, rendered as static text. Save persists `sale_items.unit_price = unitCost` and `discount_percent`.
- **Rate override** badge = read-only when `mrp > unitCost` (already the “price below MRP” signal).
- `applyPosGarmentGstToItem` only recomputes `netAmount` + `gstPer` from the formula above — it does **not** mutate `unitCost`.
- `normalizeDiscountsAgainstGross` only caps **bill-level** `discount_amount` / `flat_discount_amount` at save — not line `unitCost`.
- `updateMrp` sets **both** `mrp` and `unitCost` to the new MRP (wipes any rate gap).

There is **no** `updateUnitPrice` today.

---

## 1A. Direction of calculation — options

### Option 1 — Last-edited-wins per line

Flag `priceEditSource: 'discount' | 'unit'` updated on each edit.

| Failure mode |
|--------------|
| Easy to desync if any path mutates `unitCost` or `discountPercent` without updating the flag (`updateMrp`, scan merge, edit-resume). |
| Qty change is fine; MRP edit is ambiguous (which wins?). |
| Harder to reason about in support / audits. |

### Option 2 — Distinct override mode (recommended)

Once the cashier types a unit price, that line enters **`rateAuthority: 'unit'`**:

- Typed `unitCost` is authoritative.
- `discountPercent` and `discountAmount` are forced to **0** (gap to MRP is carried only as implicit rate discount — same formula already used for scan-time sale-price &lt; MRP).
- Editing Disc% / Disc Rs switches authority to **`'discount'`**: set `unitCost = mrp` (clear rate gap), then apply the typed discount as today.
- Editing MRP while `'unit'`: update **`mrp` only**; keep `unitCost`; re-clamp unit price ≤ MRP and re-run bill discount cap. Do **not** copy MRP into `unitCost` (today’s `updateMrp` would wipe the override — that path must change for override lines only).

| Failure mode if mishandled |
|----------------------------|
| Leaving Disc% non-zero while also lowering `unitCost` **stacks** two discounts (already possible today after scan-time rate &lt; MRP + Disc%). Override mode avoids that by clearing Disc% on price type. |
| Forgetting to special-case `updateMrp` reverts price to MRP. |

### Option 3 — Always derive discount from price

Every unit-price change sets `discountPercent = (mrp − price) / mrp × 100` and forces `unitCost = mrp`.

| Failure mode |
|--------------|
| Changes behaviour for **all** existing users / scan-time rate gaps (badge would disappear because `unitCost === mrp`). |
| UNIT PRICE cell would show MRP, not the negotiated rate — cashiers lose the figure they typed unless the cell shows “effective” net unit instead of `unitCost`. |
| Conflicts with current “Rate override” model and save shape (`unit_price` below MRP). |

### Recommendation (1A)

**Option 2 — distinct override mode (`rateAuthority`).**

It matches what the ledger already stores (`unit_price` below `mrp` + optional `discount_percent`), matches the Rate override badge, and minimizes surprise for Disc%-first workflows.

#### Revert survival (typed ₹1,600 must not snap back to ₹1,800)

| Path | Risk today | Design survival |
|------|------------|-----------------|
| `applyPosGarmentGstToItem` | None — does not touch `unitCost` | Keep: only refresh net/GST after `unitCost` set |
| `normalizeDiscountsAgainstGross` | None — bill-level only | Unchanged (Phase 2 must not alter it) |
| `maxLine` clamp in `updateDiscountPercent` (~3117–3149) | Resets **Disc%**, not unit price | `updateUnitPrice` gets its **own** clamp: raise `unitCost` (reduce discount) until `sumLineDiscount ≤ maxLine`; never silently set `unitCost = mrp` without toast |
| `updateMrp` | **Sets `unitCost = newMrp`** — would wipe ₹1,600 | If `rateAuthority === 'unit'`, do not assign `unitCost = newMrp` |
| `updateQuantity` | Recalc net only | Keep `unitCost`; recalc net/GST (also call `applyPosGarmentGstToItem` for GST consistency) |
| Scan / PriceSelectionDialog | Sets initial `unitCost` | Unchanged; only runs at add-time |

Cart-only flag `rateAuthority` need not be persisted if save continues to store `unit_price` + `discount_percent` (override lines save with percent 0 and `unit_price` = typed rate). On edit-resume, treat `mrp > unit_price + ε` and `discount_percent ≈ 0` as `'unit'` authority for UX.

---

## 1B. Discount cap

Today:

- Line edits clamp when `sumLineDiscount(items) > max(0, mrpTotal − flatDiscountAmount)`.
- `maxCombinedDiscountForGross(gross) = max(0, roundMoney2(gross))` — ceiling is the full gross (100% merchandise discount allowed). **Do not tighten in this task.**

**Below cost today:** There is **no** purchase-cost floor on Disc% or on `unitCost`. A cashier can already Disc% to near-zero net. Typing a unit price below cost is the same class of risk — not a new hole.

**Phase 2 requirement:** `updateUnitPrice` must go through the **same** `sumLineDiscount` / `maxLine` check. Effective line discount includes implicit `(mrp − unitCost) × qty`. If over cap → increase `unitCost` (or reject the keystroke) and toast the same “Only ₹… discount…” message. **Must not** bypass by writing `unitCost` without updating the discount sum.

---

## 1C. Who may override

### What UserRights supports today

- **Menu:** `pos_sales`, etc.
- **Special rights:** `modify_records`, `delete_records`, `cancel_invoice`, … — **no** price-override or max-discount right.
- **Roles:** org `admin` / `manager` / `user` (POS preset often menu-only).
- **Settings:** `ask_price_on_scan`, `pos_barcode_price_mode`, `enable_mrp` (purchase/sale settings) — no “edit unit price on grid” flag.

### Minimum viable control (do not ship ungated)

1. **Org setting (default off):** `sale_settings.allow_pos_edit_unit_price` (boolean, default `false`). Existing orgs unchanged.  
2. **Permission:** new special right `pos_edit_unit_price` (“Edit POS unit price”).  
   - Editable when: setting **on** AND (`admin` OR `manager` OR special right).  
   - Cashiers without the right see today’s static UNIT PRICE.

Optional later (not MVP): confirmation when effective discount % &gt; threshold; per-product floor. Floor needs master data — out of scope for Phase 1 schema-free MVP.

---

## 1D. Audit

### Price History Report today

| Tab | Source | Covers POS rate override? |
|-----|--------|---------------------------|
| Sales history | `sale_items` (`unit_price`, `mrp`, `discount_percent`, line totals) + sale header | **Partially yes** — shows unit vs MRP and savings; bill attribution via sale / customer filters |
| Price edits | `audit_logs` for **master** product/variant price changes | **No** — not line overrides on a bill |

Persisted sale already stores the overridden `unit_price`. Owner can see discounted bills in Price History → Sales (`mrp > unit_price`).

### Smallest addition (Phase 2)

**No new table required for MVP.**

1. Rely on existing `sale_items.unit_price` / `mrp` / `discount_percent` + `sales.created_by` (who saved the bill).  
2. Optional UX: in Price History Sales, badge “Rate override” when `mrp > unit_price + ε` (same rule as POS badge).  
3. If a dedicated trail is required later: append one `audit_logs` row on save when any line has `rateAuthority === 'unit'` (actor, sale id, lines, old/new) — **schema approval only if audit_logs shape needs new fields**; usually existing JSON payload is enough.

Do **not** invent a new column in Phase 1.

---

## 1E. Recommendation summary

| Topic | Decision |
|-------|----------|
| **1A coexistence** | **Override mode** (`rateAuthority: 'unit' \| 'discount'`). Typed unit price clears line Disc% / Disc Rs; Disc edit clears rate gap (`unitCost = mrp`). |
| **Revert defense** | Never let `updateMrp` / clamp paths assign `unitCost = mrp` on `'unit'` lines without an explicit user action; GST helpers stay net-only. |
| **1B cap** | Same `sumLineDiscount` + `maxLine` as Disc%; do not tighten `maxCombinedDiscountForGross`. |
| **1C gate** | Setting **off by default** + special right (admin/manager always when setting on). |
| **1D audit** | Persist via existing `unit_price`; enhance Price History Sales badge; optional audit_log on save. |
| **Schema** | **None for MVP** — `sale_settings` JSON flag + `user_permissions` special right only. |

### Phase 2 build sketch (for approval — not built)

1. `updateUnitPrice(index, value)` — clamp ≥ 0, ≤ mrp; clear disc fields; set `rateAuthority = 'unit'`; `applyPosGarmentGstToItem`; bill `maxLine` clamp.  
2. UNIT PRICE `<input>` when setting + permission; else static text.  
3. Keyboard: include cell; **no `setSelectionRange` on `type="number"`** (use `select()` / text input pattern already fixed on Sales Invoice).  
4. Save path already writes `unit_price` — confirm edit/reprint unchanged.  
5. Price History badge + optional audit_log.  
6. Do not touch `sumMrpTotal` / `savings` / `mrpTotal`, `PriceSelectionDialog`, tax formula, or discount normalizers.

### Explicit non-goals (Phase 2)

- Cost floor / per-SKU min price  
- Changing scan-time `ask_price_on_scan` dialog  
- Enabling for all orgs by default  
- Sales Invoice grid (POS only unless separately requested)

---

## Stop

Phase 1 complete. Awaiting approval before Phase 2 implementation.
