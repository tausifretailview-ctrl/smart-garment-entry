# KS Footwear — POS barcode scan wrong MRP investigation

**Report:** Scan `0040017429` shows product **BHG215-MN-BHG-RLX-BK** size 7 BK but **MRP ₹164.50** while physical label shows **₹204.50**.

## Finding (not wrong product — wrong price source)

| Field | Label / sticker | POS cart |
|-------|-----------------|----------|
| Barcode | `0040017429` | `0040017429` ✓ |
| Product | BHG215 | BHG215-MN-BHG-RLX-BK ✓ |
| Size / color | 7 / BK | 7 / BK ✓ |
| MRP | **204.5** | **164.5** ✗ |

POS resolves the correct **variant row** and reads **`product_variants.mrp`** (or `sale_price` fallback). It does **not** read MRP from the purchase bill or the printed label at scan time.

## Root causes in code

1. **Stale master MRP** — Variant master still **164.5** after a repurchase/label print at **204.5** without `syncVariantPriceFromPurchase` updating master MRP.

2. **Price dialog gap** — `ask_price_on_scan` dialog only opened when **`last_purchase_sale_price ≠ master sale_price`**. If sale price stayed **164.5** but **`last_purchase_mrp = 204.5`**, cashier never got prompted (fixed in PR: also compare MRP).

3. **Duplicate barcode / MRP tiers** — Shared EAN at two MRP tiers: if only the **164.5** tier is in stock, POS picked it silently without MRP picker (fixed: force picker when MRP tiers differ).

4. **Non-deterministic `.limit(1)`** — `fetchPosVariantByBarcode` exact match had no `ORDER BY` when multiple rows share barcode (fixed: order by `stock_qty`, use best row helper).

## Verify in Supabase (KS org)

Replace `<org_id>` with KS Footwear organization UUID.

```sql
-- 1) All live variants for this barcode
SELECT pv.id, p.product_name, pv.size, pv.color, pv.barcode,
       pv.mrp, pv.sale_price, pv.last_purchase_mrp, pv.last_purchase_sale_price,
       pv.stock_qty, pv.last_purchase_date, pv.updated_at
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
WHERE pv.organization_id = '<org_id>'
  AND pv.barcode = '0040017429'
  AND pv.deleted_at IS NULL;

-- 2) Recent purchase lines with this barcode
SELECT pi.barcode, pi.mrp, pi.sale_price, pi.sku_id, pi.product_name, pi.size,
       pb.bill_number, pb.bill_date
FROM purchase_items pi
JOIN purchase_bills pb ON pb.id = pi.bill_id
WHERE pb.organization_id = '<org_id>'
  AND pi.barcode ILIKE '%0040017429%'
  AND pi.deleted_at IS NULL
ORDER BY pb.bill_date DESC
LIMIT 10;
```

**If query 1:** one row, `mrp = 164.5`, query 2 shows recent `mrp = 204.5` → update master MRP on variant (Product Dashboard or re-save purchase sync).

## Data fix (one SKU)

```sql
-- After confirming variant id from query 1:
UPDATE product_variants
SET mrp = 204.5,
    last_purchase_mrp = 204.5,
    updated_at = now()
WHERE id = '<variant_id>'
  AND organization_id = '<org_id>';
```

## App fix (this PR)

- Prompt price selection when **MRP** drifts, not only sale price
- MRP-tier picker when duplicate barcode rows differ in MRP
- Scan candidates expansion + deterministic variant pick on fallback path

## Ops checklist

- [ ] Confirm one vs two variant rows for `0040017429`
- [ ] If master MRP wrong → update variant or re-sync from latest purchase bill
- [ ] Enable **Ask price on scan** in sale settings if shop wants cashier confirm every drift
- [ ] After deploy: scan label → if drift remains, dialog should offer **Last purchase ₹204.5**
