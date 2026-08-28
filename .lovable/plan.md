# CHIRAG MENS WEAR — barcode 450004951 investigation and data fix

## What the data says

The item is **not** missing and the purchase is **not** deleted. Verified in the live database:

- Variant `450004951` — SHIRT / D.NO 2.POKET / size M / colour BEIGE, brand DIRECT
- Stock 1, active, not deleted; parent product active, not deleted
- Bought on purchase bill **PUR/26-27/67** dated 08-Aug-2026, line not deleted, correctly linked to the variant
- Sale price ₹1199 (matches the tag), purchase price ₹765

So the barcode resolves fine on an exact scan. Two real data faults explain why the screen can look empty or wrong:

1. **MRP is blank.** This variant, and **3,665 of the in-stock variants** in this shop, have no MRP. Every MRP column, MRP-mode price and MRP label field renders blank for them, even though the purchase line carries ₹1199.
2. **Every product is flagged as an IMEI/serial item** — 848 of 848 products have `requires_imei = true`, inherited from the form's "remember last choice" default. It is dormant today (mobile-ERP IMEI enforcement is off for this shop), but the moment that switch is touched, every 9-digit garment barcode fails the IMEI length check and scanning stops working shop-wide.

## Plan

### 1. Backfill missing MRP for this organization
Use the existing `fix_missing_mrp_for_org` path: for every non-deleted variant with null/zero MRP, set MRP from the most recent purchase line's MRP, falling back to the variant's sale price when the purchase line has none. Run it as a scoped migration for CHIRAG MENS WEAR only, with a snapshot table taken first so it can be rolled back.

### 2. Clear the wrong IMEI flag for this organization
Set `requires_imei = false` for all products in this org (garment shop, no serialised units), scoped by `organization_id`, snapshot first.

### 3. Stop the flag from recurring
The form default comes from a browser-local "last used" memory that defaults to true. Change the default for `business`-type organizations to false, so a new garment/footwear product is never created as a serial item unless the user ticks it.

### 4. Make "not found" honest
When a scan resolves no row, the toast should name what was searched and whether an IMEI-length rule rejected it, instead of a bare "not found". This is the difference between the shop reporting "barcode missing" and seeing the real reason.

## Technical notes

- Both data changes are `UPDATE ... WHERE organization_id = 'e4e8ddf5-53cc-49c2-b453-739259dc53e2'`, each preceded by a `CREATE TABLE ... AS SELECT` snapshot of the affected rows for rollback.
- MRP backfill source order: latest `purchase_items.mrp` for the variant → `product_variants.last_purchase_mrp` → `sale_price`. Never overwrite an MRP that is already set.
- Form default lives in `src/utils/productRequiresImei.ts` (`getRequiresImeiFormDefault`); the change is to seed `false` when there is no stored preference.
- Scan messaging lives in `src/pages/POSSales.tsx` around the barcode-resolve branch, using the candidates already returned by `lookupVariantRowsByScan`.
- No change to barcode resolution order, stock maths, or RLS.
