# KS Footwear — barcode 0040011724 shows in purchase but stock 0

## What the data shows (verified)

Barcode `0040011724` (KC71 / A WALK / size 42 / BR) does exist as a live item, but its stock is 0.

The purchase line on bill PUR/26-27/207 (7 Sep 2026, qty 3) still *displays* barcode `0040011724`, but it is no longer linked to that item. Stock history for the line:

```text
07 Sep 13:14  +3  added to item 0040011724
07 Sep 14:01  -3  reversed from item 0040011724
07 Sep 14:01  +3  added to a NEW item, auto barcode 1000000694
```

So the 3 pieces went to a newly created duplicate KC71 record, not to the barcode printed on the tag.

This happened repeatedly on that day: five extra KC71 product records were created between 13:15 and 14:01, each holding a single auto-numbered item. Across the whole 7 Sep session, 8 new product records with 31 items were created. The bill's 40 lines now point at 5 different KC71 records.

## Cause

When the user picks an existing product from the purchase search bar and then re-saves the bill (draft resume / edit), the line is re-pointed to a freshly created product + item with a generated barcode instead of matching back to the existing item that already carries `0040011724`. The line keeps the old barcode text, so the bill looks right while the stock lands elsewhere.

## Plan

1. Confirm the exact save path that re-creates the product on edit (purchase save/atomic RPC + the search-selection barcode fill), and identify why the existing item was not matched by barcode.
2. Fix the matching rule: when a purchase line carries a barcode that already exists in the organization, always attach the line to that existing item — never create a new product/item, and never overwrite its barcode with a generated one.
3. Add a guard so a saved purchase line can never end with a line barcode that differs from the item it updated.
4. Repair the KS Footwear data: move the 7 Sep stock from the duplicate KC71 records back onto the correct barcoded items, merge/soft-delete the 5 empty duplicate KC71 records, and reconcile the stock column drift on `0040011724` (it shows 0 in the report but 6 in the legacy column).
5. Re-check Stock Report, Item-Wise Stock and Quick Stock for `0040011724` and for the full bill PUR/26-27/207 after the repair.

## Technical notes

- Org `4bc73037-e877-4123-9261-eb6e3876698c`; correct variant `f5ca4a2f…` (product `aec276e7…`, 49 variants, stock 57); duplicate variant `16bd823b…` (product `19e6e93a…`, barcode `1000000694`, stock 3).
- Movements `purchase_sku_change_out` / `purchase_sku_change_in` at 14:01:05 record the re-point.
- 605 live items org-wide carry a generated `1xxxxxxxxx` barcode with stock, so the repair scope beyond this bill should be measured before any bulk action.
- Repair runs as scoped migrations/updates with `organization_id` filters and soft deletes only.
