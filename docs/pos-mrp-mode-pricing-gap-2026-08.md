# Phase 0 — POS MRP Price Mode bills full MRP, Rate override on nearly every line

**Date:** 2026-08-24  
**Status:** Phase 0 complete (addendum 2026-08-24 evening). Measurement + design only. **No formula change. No runtime change. No live database writes.**  
**Org in the report:** KS FOOTWEAR (`ks-footwear`, `organization_id` `4bc73037-e877-4123-9261-eb6e3876698c`).  
**Screenshot bill:** `POS/26-27/2898` — footer **MRP Price Mode Active**; two cart lines with **Rate override**; Disc% / Disc Rs = 0; Unit Price = 70% of MRP (599 → 419.30, 374.50 → 262.15); footer **↓ 30.0% off**.

Related (do not duplicate):

- `docs/mrp-flag-audit-2026-07.md` — unshipped Phase 2 is a **display gate** when `enable_mrp` is **false**. This report is the opposite: MRP mode **on**.
- `docs/pos-unit-price-override-2026-07.md` — shipped `rateAuthority` / typed Unit Price. Badge predicate in live UI is **not** that flag.
- `docs/ks-footwear-pos-barcode-mrp-investigation.md` — earlier ops advice was “turn MRP mode off to bill sale price.” KS still shows the footer, so either the SQL was never applied or the setting was turned back on.
- **PR #370 / `a74270890` (same day, 2026-08-24 13:01 UTC)** — “Skip Select Price on KS Footwear and bill at last purchase.” Merged to `main` as *KS Footwear: auto-use last purchase price on sale*. This is the **named ship** of mechanism 2 below; the first draft of this doc described the live code and missed the commit.
- `docs/POS_ENGINE.md` quirk 4 — brand-discount toast can fire under MRP basis even though Disc% is forced to 0.

SELECT-only measurement: `scripts/pos-mrp-mode-pricing-gap-measure-2026-08.sql`.

Session evidence (repo copies of the Phase 0 probe, not session-local artifacts):

- `docs/pos-mrp-mode-pricing-gap-2026-08/characterisation-2026-08-24.txt`
- `docs/pos-mrp-mode-pricing-gap-2026-08/anon-rls-probe-2026-08-24.txt`

---

## Verdict

Two independent mechanisms produce the screenshot. They look the same on the till. Staff confirmation (Q1) is still useful, but **mechanism 2 is not a hypothetical** — it shipped on KS the same morning as this investigation.

1. **Settings contract vs add-line default.** Settings copy and `resolveAddLinePrices()` agree: when `grossBasis === 'mrp'` and there is **no** `overridePrice`, a new line is billed at **catalogue MRP** with **Disc% forced to 0**. Master `sale_price` and brand / product sale-discount percents are computed, then discarded. Cashiers who want the tagged sale price must type it into Unit Price (if that setting is on) or leave the customer paying full MRP.

2. **KS last-purchase auto-apply silently disables (1).** This is `a74270890` / PR #370, not a latent side effect we inferred. Desktop POS (`POSSales.tsx`) calls `pickLastPurchaseScanPrice` **before** add. `resolveSaleScanPriceSource` **defaults KS Footwear to `last_purchase`** (other orgs opt in via `sale_settings.auto_use_last_purchase_price`). `resolveAddLinePrices` treats any `overridePrice` as “not MRP-as-price”: `unitCost = last_purchase_sale_price`, Disc% is **not** forced to 0, brand/product percents apply. The footer still says **MRP Price Mode Active** because that chip reads org settings only. Mobile POS does **not** run this path, so the same SKU can bill full MRP on phone and discounted last-purchase on desktop.

3. **The Rate override badge is not `rateAuthority`.** Live predicate is `enableMrp && mrp > unitCost + 0.001` (`POSSales.tsx` cart grid; same on `TabletPOSLayout.tsx`). `rateAuthority: "unit"` is set only when a human commits the Unit Price cell (`updatePrice` in `cartMutators.ts`, via `applyUnitPriceToCart` / `requestUnitPriceCommit`). Add-line never sets it. It is **not persisted**. So a last-purchase gap from `a74270890` lights the same sky-blue chip as a typed override. Git does **not** show an 24 Aug rewrite of this predicate from `rateAuthority === 'unit'` to `mrp > unitCost` — the July design doc wanted the former; live UI has been the gap test. What moved the same day is **what gets written into `unitCost` on a KS scan**.

**Q1, partially from code (still ask the shop):** cashiers did **not** have to type for the screenshot shape to appear. From 13:01 UTC 24 Aug, every KS desktop add with `last_purchase_sale_price` / `last_purchase_mrp` filled bills that last-purchase sale automatically, including under MRP mode. Query 3 on `POS/26-27/2898` still decides whether *that* bill’s units match last-purchase (post-deploy) or something else (typed, or pre-deploy MRP-as-price). Exact 30% off two SKUs is consistent with purchase-time `sale_price = 0.7 × mrp` **or** a typing habit; `a74270890` makes the first sufficient.

**Do not invent a fourth pricing engine.** `a74270890` **is** mechanism 2, named and dated. The miss in the first draft was failing to cite the same-day ship and its intent (stop Select Price prompts on Sales Invoice FL505), not a separate formula.

**Do not fold this into MRP-flag Phase 2.** That work gates chrome when `purchase_settings.show_mrp` is false. KS has the field on. Changing `resolveAddLinePrices` under `useMrpAsPrice` is a new, signed-off Phase 1.

---

## Confirmed code facts (re-verified 2026-08-24)

Characterisation tests still encode today’s add-line contract (`src/lib/posBilling/posBilling.characterisation.test.ts`, 51 tests green in this run):

- MRP basis: `unitCost = displayMrp`, `discountPercent = 0`, even when `brandDiscountPercent: 10`.
- Sale-price basis: `unitCost = salePrice`, brand Disc% applies, `showDiscount` when MRP > sale.
- `overridePrice` **disables** `useMrpAsPrice` even when `grossBasis === 'mrp'`.

| Claim | Result |
|--------|--------|
| When does POS use MRP as the selling rate? | `grossBasis = 'mrp'` iff `purchase_settings.show_mrp === true` **and** `sale_settings.pos_barcode_price_mode === 'mrp'` (`POSSales.tsx` / `MobilePosBilling.tsx`). Footer chip uses the same pair. |
| Fresh add without override | `resolveAddLinePrices`: `useMrpAsPrice = grossBasis === 'mrp' && !overridePrice` → `unitCost: displayMrp`, `discountPercent: 0`. `displayMrp = max(mrp, salePrice)` when MRP > 0. |
| Where brand / product % go | Computed in `resolveAddLinePrices`, then **zeroed** by the `useMrpAsPrice` branch. `addLine` still passes them. POS still toasts “Brand discount applied” when brand % > 0 (`POS_ENGINE.md` quirk 4) even though the line Disc% is 0. |
| Who sets `rateAuthority: "unit"` | Only `updatePrice()` in `cartMutators.ts` (human Unit Price commit). `minUnitPriceForDiscountCap` stamps it on a **temporary copy** for cap math, not on the live cart. Disc% / Disc Rs editors set `'discount'` and restore `unitCost = mrp`. Add-line / last-purchase / edit-resume do **not** set it. |
| What the badge actually tests | `enableMrp && (mrp > unitCost + 0.001)`. Title text: “Selling rate below MRP (manual rate / loaded invoice line)”. Tablet copy: “Unit price below MRP — line discount applied”. **Not** `rateAuthority`. |
| Persist | `sale_items.unit_price`, `mrp`, `discount_percent`. No `price_overridden` column in generated types. Edit-resume comment: “rateAuthority unset until price_overridden column”. |
| Last-purchase vs MRP mode | Shipped **24 Aug 2026** in `a74270890` (PR #370). `resolveSaleScanPriceSource` defaults KS to `last_purchase`; explicit `auto_use_last_purchase_price` overrides for any org. `shouldPromptPosPriceSelection` **skips the dialog** when `posUsesMrpAsPrice`, but `pickLastPurchaseScanPrice` runs **first** and still sets `overridePrice`. MRP mode therefore skips the prompt **and** still bills last-purchase sale on KS desktop. The new Settings toggle copy: “Skip the Select Price dialog and bill at last purchase sale price and MRP. On for KS Footwear by default.” That rule does **not** read `pos_barcode_price_mode`. |
| Unit Price cell | Editable only when `sale_settings.allow_pos_edit_unit_price` **and** (admin / manager / `pos_edit_unit_price`). Default confirm threshold **30%** below MRP — typing the screenshot 30% off would open the confirm dialog on every line. Last-purchase add does **not** go through that dialog. |
| Line net / cap | `calculatePosCartLineNet` / `sumLineDiscount`: MRP×qty − Disc% − Disc Rs − max(0, (MRP − unitCost)×qty). Cap `maxCombinedDiscountForGross(gross) = round(gross)` (100% of MRP total). Implicit MRP−unit gap already counts as discount. |
| Sales Invoice (contrast) | Bills from `salePrice`, then extra Disc%. Does **not** also subtract (MRP − salePrice). POS sale-price basis **does** stack that implicit gap with brand Disc%. |

Worked numbers from the screenshot (qty 1, Disc% 0):

```text
line 1: mrp 599, unitCost 419.30 → implicit = 179.70 (30%) → net 419.30
line 2: mrp 374.50, unitCost 262.15 → implicit = 112.35 (30%) → net 262.15
footer: sumMrpTotal 973.50, discount 292.05, net 681, effective % off = 292.05/973.50 = 30.0%
```

That shape is **unit below MRP + Disc% 0**. It is **not** Disc% = 30 with unit = MRP (the Disc% column would show 30, and the badge would not fire if unit still equalled MRP).

---

## Same-day commit `a74270890` (PR #370) — this is mechanism 2, named

The first draft described last-purchase auto-apply from live code and did not cite the commit that put it there **the same morning**.

| | |
|--|--|
| Commit | `a74270890` *Skip Select Price on KS Footwear and bill at last purchase.* (2026-08-24 **13:01 UTC**) |
| Merge | PR **#370** `245c7199d` *KS Footwear: auto-use last purchase price on sale* (2026-08-24 **13:01 UTC** / 18:31 IST) |
| Intent (commit message) | Sales Invoice was prompting Master vs Last Purchase on every add when prices drifted (**FL505 7**: master ₹258.65 vs last ₹230.65). KS now uses last purchase sale/MRP automatically. Other orgs can opt in via Settings. |
| Files | New `src/utils/saleScanPricePreference.ts` + tests; wired into **Sales Invoice, POS, and Sale Order**; Settings toggle `auto_use_last_purchase_price` (KS default on via slug, disables “Ask Price When Last Purchase Differs”). |

This investigation’s Phase 0 branch was cut **after** #370 was already on `main`. The code reading was therefore of the post-`a74270890` tree. The gap was attribution and product framing, not a missed code path.

**What `a74270890` does not do:** it does not change `resolveAddLinePrices`, MRP-mode Settings copy, or the Rate override predicate. It only injects `overridePrice = { sale_price: lastPurchaseSale, mrp: lastPurchaseMrp }` on add. That single assignment is enough, because `useMrpAsPrice = grossBasis === 'mrp' && !overridePrice`.

**Precedence that already exists (do not redesign from zero):**

```text
auto_use_last_purchase_price === true     → last_purchase   (any org)
auto_use_last_purchase_price === false    → master or ask   (respects ask_price_on_scan)
slug === ks-footwear (flag unset)         → last_purchase
otherwise                                 → ask (default) or master if ask is off
```

`pos_barcode_price_mode` is **not** in that function. Product decision 2 is therefore: should MRP mode **beat** this already-shipped per-org rule, or sit underneath it (today’s L1)? Inventing a new KS-only switch would duplicate `a74270890`.

**Deploy vs screenshot:** `POS/26-27/2898` was captured in the Phase 0 prompt later the same afternoon (user message ~18:27 UTC). If production had deployed #370, the bill is explained without typing. If it had not, mechanism 1 (full MRP) plus typing is still in play. Query 3 is the tie-break; do not assume Vercel lag.

---

## Q1 — Are cashiers typing the discounted price?

**Not confirmed with KS staff.** This environment has no org login, no shop phone/WhatsApp, and no till session. Do not treat the screenshot as a substitute for a cashier’s “I typed it.”

**Partial answer from `a74270890`:** for KS **desktop** POS, last-purchase billing is **automatic** whenever last-purchase columns exist. Staff did not need to type Unit Price for Rate override + Disc% 0 + unit below MRP to appear. That is sufficient to explain the *report* (“prices change automatically”) without inferring a typing habit. It is **not** yet proof that `POS/26-27/2898` itself came from last-purchase (query 3) or that nobody ever types a further special rate (Q1.2).

Anon `GET /rest/v1/sale_items?select=id&limit=1` and `GET /rest/v1/settings?select=organization_id&limit=1` → **HTTP 200, `[]`**. Same RLS wall as other Phase 0 docs this month.

### What to ask (plain, in order)

Ask a KS cashier who rings POS, while standing at the till with **MRP Price Mode Active** showing:

1. After you scan a shoe, before you touch Unit Price, is the Unit Price already the lower figure (₹419-style) or is it the full MRP (₹599-style)?
2. Do you type the selling price on **every** line, or only when you give someone a special rate?
3. When you type it, does a popup say the price is more than 30% below MRP?
4. Do you ever press Disc% / Disc Rs, or only Unit Price?
5. On the phone POS, does the same barcode come in at a **different** price than the counter PC?

### What the screenshot + code can and cannot prove

| Observation | Supports |
|-------------|----------|
| Disc% = 0 and unit = 70% of MRP | Unit-price path (typed **or** last-purchase/sale-price add). Not product/brand Disc%. |
| Rate override on both lines | Only `mrp > unitCost`. Does **not** prove a keystroke. |
| “Prices change automatically” (the report) | Fits `a74270890` last-purchase auto-apply on KS desktop **without** a keystroke. Typing is no longer the leading hypothesis for *automatic* change. |
| Exact 30.0% on two SKUs | Shop formula (purchase last/master sale_price = 70% of MRP) **or** a habit of always keying 30% off. Query 3 distinguishes. `a74270890` makes the formula path automatic. |
| Confirm dialog default 30% | Only if they **type** Unit Price ≥30% below MRP. Last-purchase add does **not** open that dialog. If Q1.3 is “no popup,” that supports auto-apply, not typing. |

**If query 2 shows `allow_pos_edit_unit_price` is not true**, cashiers **cannot** type Unit Price (unless admin/manager/special right). Then Q1 is answered by settings: the lower rate is automatic.

---

## Q2 — Blast radius

### What we could run

Anon RLS: empty. **Do not treat empty as “zero MRP-mode orgs.”**

`rateAuthority = 'unit'` **cannot be counted on saved sales.** It never left the cart. The July `price_overridden` column was not applied (`types.ts` has no such field).

### Exact query (service-role / SQL Editor)

`scripts/pos-mrp-mode-pricing-gap-measure-2026-08.sql`

Capture and paste back:

1. **Query 1** — every org with `pos_barcode_price_mode = 'mrp'` **and** `purchase_settings.show_mrp = true`, plus `allow_pos_edit_unit_price` and `auto_use_last_purchase_price`.
2. **Query 2** — KS row of those flags.
3. **Query 3** — `POS/26-27/2898` lines vs `product_variants.sale_price` / `last_purchase_sale_price` / 30% off.
4. **Query 4** — last 14 days, POS lines only (`sale_number LIKE 'POS/%'`), per MRP-mode org: `%` that would show the badge (`mrp > unit_price`), `%` billed at full MRP.
5. **Query 5** — same lines classified: match last-purchase sale, match master sale, match line MRP, 30%-off-only, unmatched below MRP.

A number near **100% badge_pct** means the chip is systemic for that org, not occasional. A high **matches_last_purchase_sale** with low **matches_line_mrp** means last-purchase auto-apply is the live till, not `useMrpAsPrice`. A high **unmatched_below_mrp** with `allow_pos_edit_unit_price` on is the typing hypothesis.

**Caveat:** settings are current. An org that switched MRP mode last week will still classify older lines under today’s flags. Fourteen days limits the damage; it does not remove it.

---

## Q3 — Is anyone relying on bill-at-full-MRP on purpose?

**Settings copy says yes, that is the feature.**

`Settings.tsx` when the switch is on:

> Enabled: every POS add (barcode, search, or product pick) uses MRP as the selling rate with **no line discount**.

Disabled: Sale Price, show MRP vs sale discount.

So an org that turned this on to negotiate from list (or to bill sticker MRP with no master sale-price) is using the documented behaviour. Query 4 **billed_at_full_mrp_pct** near 100% on a busy till is the fingerprint. Do **not** silently change that org to sale-price billing.

KS is a **poor** example of that workflow:

- An earlier investigation already told them to **turn the switch off** so scans bill sale price (`docs/ks-footwear-pos-barcode-mrp-investigation.md`).
- Slug default last-purchase (`a74270890`) already bills `last_purchase_sale_price` on desktop whenever those columns are filled, which **contradicts** the Settings sentence above. That contradiction is now a **deliberate, same-day KS product change** (stop Select Price prompts), not an accidental interaction.
- The screenshot is 30% off, not full MRP.

**Phase 1 needs an opt-out** (keep today’s `unitCost = displayMrp` + Disc% 0) if query 1 returns any org whose query 4 is mostly billed-at-MRP. KS should not drive a blanket flip by itself.

---

## Q4 — `brandDiscountPercent` / `productSaleDiscountPercent` vs `sale_price`

These are **not** the MRP → tagged-price conversion. Do not drive the fix off them.

| Input | Source | Meaning | POS add today (sale-price basis) | POS add today (MRP basis, no override) |
|-------|--------|---------|----------------------------------|----------------------------------------|
| `masterSalePrice` | `product_variants.sale_price` | Tagged / intended **unit rate**. Sales Invoice bills from this. | `unitCost` | Computed, then **replaced** by MRP |
| `overridePrice.sale_price` | Last purchase or price dialog | Same role, scan-time substitute | `unitCost` | Disables MRP-as-price; becomes `unitCost` |
| `brandDiscountPercent` | `customer_brand_discounts` via `getBrandDiscountForProduct` (exact brand, else name tokens). **0** for walk-in / no customer. | Extra **Disc%** for that customer’s brand | Line Disc% (wins over product %) | Computed, then **forced 0** |
| `productSaleDiscountPercent` | `products.sale_discount_value` when type is missing or `'percent'`. **Flat ₹ type is ignored** on POS add. | Extra product-master Disc% | Line Disc% if no brand % | Computed, then **forced 0** |

Sales Invoice net = `salePrice × qty` minus Disc%. It does **not** also subtract (MRP − salePrice).

POS net **always** subtracts (MRP − unitCost)×qty as well as Disc%. Characterisation: sale price 800, MRP 1000, brand 10% → net **700** (100 Disc% + 200 implicit). That is stacking, not “10% off MRP.”

**Would stopping the discard of brand/product % under `useMrpAsPrice` produce ₹419.30?** Only if those percents are 30 **and** unit stays at MRP: Disc% column would show **30**, badge would **not** show (unit = MRP). The screenshot is the opposite (Disc% 0, badge on, unit 419.30). So the ₹419.30 lives in **unit price** = `sale_price` or `last_purchase_sale_price` or a typed rate — not in those percent fields.

Product Entry “Sale Discount” is an extra off **sale price**, previewed as net after that %. It is not “this product sells at 30% off MRP” unless someone also stored `sale_price = 0.7 × mrp`.

**Recommendation for Phase 1 math:** intended selling rate = `variant.sale_price` (or last-purchase override when that path is intentionally on). Keep brand/product Disc% as **optional extras**, not as the MRP-mode default. Applying them on top of `unitCost = sale_price` would stack and undercharge vs Sales Invoice.

---

## Q5 — Discount cap, “Saves N%”, `sumMrpTotal`

Today’s MRP-mode add starts at **zero** implicit discount (`unitCost = MRP`). The cap **formula** does not assume that. `sumLineDiscount` already includes the MRP−unit gap. `maxCombinedDiscountForGross` is 100% of `sumMrpTotal` (Σ MRP×qty). Footer `% off` = `(line implicit + Disc% + Disc Rs + flat) / totals.mrp`.

If MRP-mode add switched to `unitCost = sale_price` (419.30) with Disc% still 0:

| Piece | What changes |
|-------|----------------|
| `sumMrpTotal` / cap ceiling | **Unchanged** (still catalogue MRP gross, e.g. 973.50). **Do not retarget** `maxCombinedDiscountForGross`. |
| `sumLineDiscount` on a fresh 2-line bill | Jumps from 0 to 292.05 (the implicit 30%). Extra cashier Disc% / flat room becomes the remaining **sale-price** value (₹681), same as sale-price mode today. |
| “Starts at zero discount” | Only the **initial cart state** changes. Cap arithmetic already knew how to count the gap. |
| Footer struck MRP / ↓ N% off | Would appear **on add**, without a keystroke. That is the desired customer-facing MRP-mode story (show list, bill tagged). |
| Double discount risk | If Phase 1 also applies brand/product Disc% while `unitCost` is already sale_price, net stacks (Q4). Keep Disc% 0 at add under MRP mode unless product explicitly wants sale-price-mode stacking. |
| Tests that must move in Phase 1 | Characterisation: “mrp basis: unitCost = displayMrp, discount forced 0” and “addLine mrp basis: no brand disc; unit = displayMrp”. |

No change to print / `@media print` / tax invoice in this workstream. Cap and savings stay screen POS.

---

## Design proposal (not built)

### What “good” looks like on the till

Scan in MRP Price Mode: MRP column shows list (struck in the footer when lower), **Unit Price is the tagged selling rate**, Disc% stays 0 unless the cashier (or brand/product extra) adds more, **Rate override only if someone typed Unit Price** (or a future persisted `price_overridden`).

### Add-line (`resolveAddLinePrices` under `useMrpAsPrice`)

Sketch — for approval, not implementation:

```text
displayMrp     = existing max(mrp, salePrice) rule
taggedSale     = overridePrice?.sale_price ?? masterSalePrice
useMrpAsPrice  = grossBasis === 'mrp' && !overridePrice   # unchanged, unless Q below

if useMrpAsPrice:
  if taggedSale > 0 and taggedSale + ε < displayMrp:
    unitCost = taggedSale          # bill tagged price
  else:
    unitCost = displayMrp          # no sale price, or sale ≥ MRP → bill MRP
  discountPercent = 0              # still discard brand/product % at add
  showDiscount = displayMrp > unitCost
else:
  # today’s sale-price / override path
```

Do **not** set `rateAuthority: "unit"` on this automatic gap. That flag stays “human typed the rate.”

### Badge (required companion, still Phase 1, not this Phase 0)

If add-line bills `sale_price` under MRP mode, today’s badge predicate would fire on **every** discounted SKU and make the chip worse. Phase 1 must change the chip to `item.rateAuthority === 'unit'` (desktop + tablet). Edit-resume will **not** show it until `price_overridden` exists — that is acceptable (chip becomes conservative) or we persist the column (already written as an unapplied SQL file). **Do not** ship sale-price-as-default without this badge change.

### Last-purchase vs MRP mode (product call, do not bury)

A **per-org last-purchase vs ask vs master** rule **already shipped** in `a74270890` (`resolveSaleScanPriceSource` + Settings `auto_use_last_purchase_price`, KS default on). Phase 1 must not invent a second KS-only switch for the same job.

What does **not** exist yet: that rule consulting `pos_barcode_price_mode`. Today last-purchase **wins** over MRP-as-price on every KS desktop add with last-purchase data (L1 in live code).

| Choice | Effect |
|--------|--------|
| **L1** Leave last-purchase override as today (`a74270890` unchanged) | KS desktop already bills last-purchase sale under the MRP-mode footer. Changing `useMrpAsPrice` only helps **mobile**, never-purchased SKUs, and non-KS MRP-mode orgs without auto last-purchase. |
| **L2** Skip last-purchase (and the dialog) entirely when MRP mode is on | Honour Settings “bill MRP.” KS desktop would jump **to full MRP** — the opposite of the screenshot complaint, and it would **undo** the FL505 prompt fix on POS for MRP-mode orgs. Only safe if Q1 says they want sticker MRP. |
| **L3** Last-purchase may override **MRP display** but selling rate stays tagged sale / last sale | Closest to “show real sticker, bill intended rate.” Needs an explicit rule when last MRP ≠ master MRP (the 164.50 vs 204.50 class of bug). |

Default recommendation to put in front of Tausif: **L1 + add-line tagged sale when there is no override**, so mobile/unpurchased SKUs stop landing on full MRP, and KS desktop does not get a surprise full-MRP jump that reverts #370. Rewrite Settings copy so it no longer promises “MRP as the selling rate with no line discount” while last-purchase can still win.

### Opt-out

If query 4 finds orgs that really bill full MRP:

- Keep `pos_barcode_price_mode = 'mrp'` meaning **today’s** add (unit = MRP, Disc% 0), **or**
- Split settings: “Show MRP / savings on POS” vs “Default selling rate = MRP | Sale price”.

Do not reuse MRP-flag Option A (hide chrome when `show_mrp` is false) as this opt-out.

### Fallback when no discount is configured

**Do not require** a sale price to use MRP mode. If `sale_price` is 0 / null / ≥ MRP, bill MRP. That is the honest sticker. Product can later require sale_price on purchase — out of scope.

### Brand % in MRP mode

Leave discarded at add (today). If a named customer has brand 10% and tagged sale is already 30% off MRP, applying 10% Disc% on POS would charge less than Sales Invoice. Flag if a shop wants brand-on-MRP (unit = MRP, Disc% = brand) as a **different** mode.

### Explicit non-goals for Phase 1

- No live repair of old `sale_items`.
- No change to `maxCombinedDiscountForGross`, print, garment GST, or `sumMrpTotal` basis.
- No applying `docs/pos-unit-price-price-overridden-migration.sql` unless product wants edit-resume badges.
- No MRP-flag Step 1/2/3 display-gate work.
- No turning KS’s switch off from code (ops can still use the existing SQL if they only wanted sale-price mode).

---

## Product decisions (stop — do not decide here)

These remain Tausif’s. `a74270890` **narrows** 2 and 6; it does not pick 1.

1. **Is MRP Price Mode “bill MRP” or “show MRP, bill tagged sale”?** Settings copy says the first; KS screenshot + earlier ops note + same-day last-purchase default want the second on the KS till. This is the meaning call. Do not delegate it into a code default.
2. **Last-purchase vs MRP mode:** L1 / L2 / L3 above. A per-org last-purchase-vs-ask-vs-master rule **already exists** (`a74270890`). The open question is only whether MRP mode should **override** that rule. L2 would fight #370 on POS.
3. **Badge after ship:** `rateAuthority` only (edit-resume silent) vs also persist `price_overridden`.
4. **Orgs that bill full MRP today:** keep current add as opt-out, or split the setting.
5. **Brand/product Disc% in MRP mode:** keep forced 0 at add, or sale-price-mode stacking.
6. **Unit-price confirm-dialog default 30%:** relevant **only if** cashiers still type. After `a74270890`, KS automatic last-purchase **does not** hit that dialog. Do not treat the 30% confirm as the KS pain; the live precedence pain is last-purchase winning under an MRP-mode footer. If query 3 shows unmatched-below-MRP typing anyway, then the popup is still part of *that* path.

---

## Phase 1 build prompt (after Tausif signs off)

Draft only — do not implement until the SQL paste-back exists and Tausif has taken decisions 1–2 (and 3–6 as needed):

1. Paste query 1–5 results into this doc (or a short follow-up note). Use Q1 with KS to confirm they are not *also* typing special rates; do not use Q1 to rediscover `a74270890`.
2. If the signed-off story is “show MRP, bill tagged sale”: implement the `resolveAddLinePrices` sketch; keep Disc% 0 at add; update characterisation tests; fix brand toast so it does not claim a % that was discarded.
3. Change Rate override chip to `rateAuthority === 'unit'` on desktop + tablet.
4. Rewrite Settings helper text to match the signed-off meaning (MRP mode copy currently lies when last-purchase wins). Add opt-out if Q3 found a full-MRP org.
5. Decide L1/L2/L3 **against the already-shipped** `resolveSaleScanPriceSource` rule; do not leave mobile vs desktop split undocumented; do not revert #370 by accident.
6. Do not touch print CSS, settlement formulas, or MRP-flag display-gate PRs.

---

## Waiting

1. SQL Editor paste-back of `scripts/pos-mrp-mode-pricing-gap-measure-2026-08.sql` (query 3 on `POS/26-27/2898` especially).  
2. Optional KS cashier answers to Q1.2–Q1.5 (typing *on top of* auto last-purchase, phone vs PC). Q1.1 is largely answered by `a74270890` for desktop SKUs with last-purchase data.  
3. Tausif sign-off on product decisions **1 and 2** first (MRP-mode meaning; last-purchase vs MRP precedence given #370). Then 3–6. Then a scoped Phase 1 prompt.
