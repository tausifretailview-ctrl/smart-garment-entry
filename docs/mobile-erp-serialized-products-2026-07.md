# Mobile ERP — per-product IMEI vs universal barcode

**Date:** 2026-07-28  
**Scope:** Phase 1 investigation only. No application code, no schema, no cleanup.  
**Trigger:** Accessories (e.g. Syska Beatpods, EAN `8908022788079`) bought in qty 3 share one retail barcode; org-level IMEI enforcement opens `IMEIScanDialog`, blocks duplicates, bill cannot save.

---

## Problem (confirmed)

| Kind | Example | Barcode | Needed behaviour |
|------|---------|---------|------------------|
| **Serialized** | Handsets | Unique 15-digit IMEI per unit | One IMEI → one `product_variants` row (unit-as-variant); duplicates must stay rejected |
| **Non-serialized** | Chargers, neckbands, covers | One EAN-13 / UPC for every unit of the model | One shared variant + plain qty; no IMEI dialog |

Today `product_settings.mobile_erp.imei_scan_enforcement` is **org-wide**. With Mobile ERP on, **every** purchase line with qty &gt; 1 is forced through unique-IMEI scanning.

**Wrong fixes (explicitly rejected):**
- Allow duplicate IMEIs on serialized products  
- Turn `imei_scan_enforcement` off for the whole org  

---

## 1A — Where does the flag belong?

### Option A — New `product_type` value (e.g. `serialized`)

`products.product_type` is already `'goods' | 'service' | 'combo'` in:

| Consumer | Role of `product_type` |
|----------|------------------------|
| `src/lib/validations.ts` | `z.enum(["goods","service","combo"])` |
| `ProductEntryDialog` / `ProductEntry` | UI type picker; service skips size grid / opening stock |
| `POSSales` / `SalesInvoice` | `isStockTracked*` — service/combo skip stock gates |
| Stock triggers / migrations (`service_product_stock_guards`, etc.) | Skip stock for `service` (and historically combo) |
| Dashboard filters / RPCs (`p_product_type`) | Filter chips assume the three values |
| Net profit / stock settlement / owner stock | Exclude or special-case `service` |

**Adding `serialized` as a fourth type** would:
- Force every enum, UI picker, filter, and stock helper to learn a new value  
- Overload a column that today means **stock / accounting kind**, not **serial tracking**  
- Leave ambiguity: is a serialized handset still `goods`? (Yes — it must keep stock.)

**Verdict:** Do **not** overload `product_type`.

### Option B — Drive from `category`

Shop photo shows category-like “ACCESSORIES”, but:
- Category is **free text** / org-specific (no stable enum)  
- Same category often mixes serialized and non-serialized over time  
- Renames / typos break enforcement silently  

**Verdict:** Too weak as the sole gate. Optional *default suggestion* in UI later (“Accessories → uncheck IMEI”), not the source of truth.

### Option C — Dedicated boolean `products.requires_imei` (**recommended**)

| Pros | Cons |
|------|------|
| Orthogonal to goods/service/combo | New column + Product Entry control |
| Default can preserve today’s behaviour for all existing rows | Phase 2 schema approval required |
| Clear copy: “This product has a unique IMEI/serial per unit” | Must thread through purchase + POS gates |
| Org master switch still narrows: enforcement only when `mobile_erp.enabled && imei_scan_enforcement && requires_imei` | — |

**Default for Phase 2:** `requires_imei boolean NOT NULL DEFAULT true`  
→ Every current product keeps IMEI behaviour; accessories are opted **out** explicitly.  
→ Orgs without Mobile ERP ignore the flag (no UI, no purchase/POS branch change).

**Do not** auto-migrate products to `requires_imei = false` by EAN length or category — that silently drops tracking (Phase 2 non-goal).

### 1A recommendation

**`products.requires_imei` (boolean, default `true`).**  
Reuse neither `product_type` nor `category` as the authority.

---

## 1B — How much bad data already exists?

This environment has **no service-role / staging DB** against tenant data. Counts below must be run by an operator in the Supabase SQL Editor (production or approved read replica). **Do not clean anything.**

### Read-only SQL (orgs with Mobile ERP enabled)

```sql
-- 0) Orgs with Mobile ERP on
WITH mobile_orgs AS (
  SELECT organization_id
  FROM settings
  WHERE COALESCE((product_settings->'mobile_erp'->>'enabled')::boolean, false) = true
)
SELECT organization_id FROM mobile_orgs;

-- 1) purchase_items barcodes shorter than 15 digits (likely EAN / short fakes)
--    Scoped via purchase_bills.organization_id (purchase_items has no organization_id).
WITH mobile_orgs AS (
  SELECT organization_id
  FROM settings
  WHERE COALESCE((product_settings->'mobile_erp'->>'enabled')::boolean, false) = true
)
SELECT
  pb.organization_id,
  COUNT(*) AS short_barcode_rows,
  COUNT(*) FILTER (WHERE length(regexp_replace(pi.barcode, '\s', '', 'g')) IN (12, 13)
                   AND pi.barcode ~ '^[0-9]+$') AS ean12_13_rows,
  COUNT(*) FILTER (WHERE length(regexp_replace(pi.barcode, '\s', '', 'g')) < 12) AS under_12_rows
FROM purchase_items pi
JOIN purchase_bills pb ON pb.id = pi.purchase_id
JOIN mobile_orgs mo ON mo.organization_id = pb.organization_id
WHERE pi.deleted_at IS NULL
  AND pb.deleted_at IS NULL
  AND pi.barcode IS NOT NULL
  AND length(regexp_replace(pi.barcode, '\s', '', 'g')) < 15
GROUP BY pb.organization_id
ORDER BY short_barcode_rows DESC;

-- 2) Same barcode repeated on multiple purchase_items within an org
WITH mobile_orgs AS (
  SELECT organization_id
  FROM settings
  WHERE COALESCE((product_settings->'mobile_erp'->>'enabled')::boolean, false) = true
),
norm AS (
  SELECT
    pb.organization_id,
    upper(regexp_replace(pi.barcode, '\s', '', 'g')) AS code,
    pi.id
  FROM purchase_items pi
  JOIN purchase_bills pb ON pb.id = pi.purchase_id
  JOIN mobile_orgs mo ON mo.organization_id = pb.organization_id
  WHERE pi.deleted_at IS NULL
    AND pb.deleted_at IS NULL
    AND coalesce(pi.barcode, '') <> ''
)
SELECT organization_id, code, COUNT(*) AS times_used
FROM norm
GROUP BY organization_id, code
HAVING COUNT(*) > 1
ORDER BY times_used DESC
LIMIT 100;

-- 3) Sequential / trivial fakes (1, 2, 3, … or very short)
WITH mobile_orgs AS (
  SELECT organization_id
  FROM settings
  WHERE COALESCE((product_settings->'mobile_erp'->>'enabled')::boolean, false) = true
)
SELECT
  pb.organization_id,
  pi.barcode,
  pi.product_name,
  pb.bill_number,
  pb.bill_date
FROM purchase_items pi
JOIN purchase_bills pb ON pb.id = pi.purchase_id
JOIN mobile_orgs mo ON mo.organization_id = pb.organization_id
WHERE pi.deleted_at IS NULL
  AND pb.deleted_at IS NULL
  AND (
    regexp_replace(pi.barcode, '\s', '', 'g') ~ '^[0-9]{1,3}$'
    OR upper(regexp_replace(pi.barcode, '\s', '', 'g')) ~ '^(TEST|FAKE|TEMP)'
  )
ORDER BY pb.organization_id, pb.bill_date DESC
LIMIT 200;

-- 4) Sample of likely EAN stored as IMEI (13-digit numeric), with product name
WITH mobile_orgs AS (
  SELECT organization_id
  FROM settings
  WHERE COALESCE((product_settings->'mobile_erp'->>'enabled')::boolean, false) = true
)
SELECT
  pb.organization_id,
  pi.product_name,
  pi.barcode,
  pi.qty,
  pb.bill_number,
  pb.bill_date
FROM purchase_items pi
JOIN purchase_bills pb ON pb.id = pi.purchase_id
JOIN mobile_orgs mo ON mo.organization_id = pb.organization_id
WHERE pi.deleted_at IS NULL
  AND pb.deleted_at IS NULL
  AND regexp_replace(pi.barcode, '\s', '', 'g') ~ '^[0-9]{13}$'
ORDER BY pb.bill_date DESC
LIMIT 50;
```

### Expected workarounds (from code + screenshots)

1. **Blocked path (screenshot):** Scan same EAN into multiple IMEI slots → “Duplicate found” / Confirm disabled.  
2. **Warn-only path:** `getUniversalCodeScanWarning` warns on 12/13-digit codes but **does not block** if length is within `imei_min_length`–`imei_max_length` (defaults **4–25**, so EAN-13 **passes** length validation). Operators can still confirm **one** unit with the EAN as barcode; qty 3 requires three **distinct** strings → forces suffixes / fake serials / one-by-one inventiveness.  
3. **Org switch off:** Disables protection for handsets too (rejected as a fix).

### Counts

| Metric | Result |
|--------|--------|
| Orgs with Mobile ERP / short barcodes / repeated codes / fakes | **Not run here** — paste SQL above into SQL Editor; paste counts back for Phase 2 cleanup decision |

---

## 1C — Which surfaces enforce IMEI?

| Site | What it does today | Respects per-product flag? | Phase 2 change |
|------|--------------------|----------------------------|----------------|
| `IMEIScanDialog.tsx` (~56–58, 93) | Length gate + **in-dialog duplicate** block; Confirm disabled if dupes | N/A (only opened by callers) | Keep duplicate logic for serialized; **do not open** for `requires_imei = false` |
| `PurchaseEntry.tsx` `updateLineItem` (~3632–3645) | qty &gt; 1 + Mobile ERP + enforcement → open IMEI dialog | **No** — org only | Gate: also `product.requires_imei` |
| `PurchaseEntry.tsx` save (~4540–4564) | Reject multi-qty lines; reject empty barcode as “IMEI required”; re-open dialog | **No** | Same product gate; non-serialized: allow qty &gt; 1 on one shared barcode/variant |
| `PurchaseEntry.tsx` `handleIMEIScanConfirm` (~3675+) | Creates **one variant per IMEI** (unit-as-variant); uniqueness via `checkBarcodeExists` | Only runs after dialog | Unchanged for serialized |
| `ProductEntryDialog.tsx` (~1628, 1639–1651, ~3625) | “IMEI Required” vs “Barcode Required”; length check; org-wide barcode uniqueness | **No** (any Mobile ERP product) | Non-serialized: barcode required once; allow shared EAN as single variant barcode; no multi-IMEI scan UI |
| `ProductEntryDialog` / locked size-qty | Forces Free size / qty 1 style Mobile ERP UX | Org `locked_size_qty` | Non-serialized should **not** force one-variant-per-unit creation |
| `validations.ts` (~77–78, ~114–115) | Max barcode length 32 (aligns with IMEI max) — **not** uniqueness | Length only | **Do not** change min/max length settings / rules |
| `utils/imeiValidation.ts` | `validateIMEI` length/charset; EAN warning helper | Warn only | Keep; optional UX: skip EAN warning when `requires_imei = false` |
| `Settings` Mobile ERP | Org master: `enabled`, `imei_scan_enforcement`, lengths, etc. | Org master | **Keep** as master; per-product **narrows** only |
| `ProductEditPanel` / post-save IMEI edit | Correct wrong scan on saved bills | Org `allow_imei_edit_after_save` | Still for serialized variants; non-serialized edit = normal barcode |
| Sales Invoice | Uses `useMobileERP` mainly for **financer** UI — not IMEI scan prompt | — | No IMEI dialog today |
| POS / deactivate audit IMEI fallback | See 1D | Org only today | Must skip IMEI-shaped rules for non-serialized |

---

## 1D — Sales side (POS)

### How POS decides “IMEI mode” today

All gated on **`mobileERP.enabled && mobileERP.imei_scan_enforcement`** (org), not on product:

1. **Placeholder** (~6191): “Scan IMEI Number” vs normal search hint.  
2. **Manual typed barcode** (~2235–2242): Reject if `!validateIMEI(term)`; warn if looks like EAN.  
3. **`searchAndAddProduct` / scanner** (~2560–2571): Same validate + EAN warning before lookup.  
4. **Primary lookup:** `fetchPosVariantByBarcode` — match `product_variants.barcode`.  
5. **Name search:** **Disabled** while IMEI enforcement is on (~2594–2595) — only barcode/IMEI path (plus shortcodes).  
6. **Legacy fallback** (~2638+): If no variant barcode match, look up `purchase_items.barcode` in-org → resolve `sku_id` → load variant (status-gated). Used when IMEI lived on purchase line / legacy data.

### What non-serialized needs at sale

- Product purchased as **one variant** with barcode = universal EAN and `stock_qty = N`.  
- POS scan of that EAN → normal `fetchPosVariantByBarcode` → `addItemToCart` with qty +1 (or merge), **same as garment barcode**.  
- Must **not** require 15-digit IMEI format if the EAN is 13 digits — today EAN-13 already passes default length 4–25, so sale of an already-created EAN variant often works **if** purchase succeeded. The purchase dialog is the main blocker.  
- Name-search disable under enforcement is awkward for accessories (search by “Beatpods”); Phase 2 may allow name search when the matched product has `requires_imei = false`, or leave name search org-gated (product call). Minimum: barcode scan of the shared EAN must work.

### POS changes for Phase 2 (sketch only)

| Step | Behaviour |
|------|-----------|
| Validate length as IMEI | Only when looking up / expecting a **serialized** unit — or: always allow lookup first; if hit and `!requires_imei`, add line; if miss and enforcement on, then apply IMEI validation / purchase_items fallback |
| EAN warning toast | Skip when product is non-serialized (or when scan matches a non-serialized variant) |
| Unit-as-variant merge | Non-serialized: increment qty on shared variant; serialized: keep one line per IMEI / qty 1 |

---

## Recommendation summary

| Topic | Decision |
|-------|----------|
| **1A flag** | **`products.requires_imei boolean NOT NULL DEFAULT true`** |
| **Not** | New `product_type`; category-only gate; duplicate IMEIs; org-wide enforcement off |
| **Org switch** | Keep `imei_scan_enforcement` as master; effective rule = `enabled && imei_scan_enforcement && requires_imei` |
| **1B** | Operator runs SQL in this doc; no cleanup in Phase 1 |
| **Purchase** | Serialized: today’s dialog + unique IMEI + unit-as-variant. Non-serialized: no dialog; qty on one barcode variant |
| **POS** | Non-serialized EAN adds stock like a normal barcode; do not demand unique IMEI |
| **Migration of existing SKUs** | Manual / approved only — never auto-flip to non-serialized |

---

## Phase 2 gate

Awaiting approval of **1A (`requires_imei`)** and operator **1B counts** before any schema or UI work.

## Stop

Phase 1 complete. No code beyond this document.
