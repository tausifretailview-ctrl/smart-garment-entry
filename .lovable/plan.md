## Goal

Permanently remove 3 mistaken Excel-imported opening-stock bills from KIDS ZONE — including the stock they added and the product master rows they created — and explain why the Purchase Dashboard Delete button currently does not work for very large bills.

## Bills targeted (KIDS ZONE)

| Bill | Date | Qty | Lines | Products | Net |
|---|---|---|---|---|---|
| PUR/26-27/10 | 10-Jun-2026 | 5,093 | 5,072 | 2,077 | ₹31,22,013 |
| PUR/26-27/14 | 10-Jun-2026 | 4,455 | 4,151 | 549 | ₹21,82,184 |
| PUR/26-27/25 | 15-Jun-2026 | 3,931 | 3,662 | 1,024 | ₹22,32,428 |

Verified: not locked, not cancelled, paid = 0, no sale_items linked (by variant or barcode), no shortfall in current stock vs. quantity to reverse.

## Why the dashboard delete didn't work

Two possible causes — both will be addressed:

1. The "Delete Records" special permission may not be enabled for this user — the button shows a "Permission Denied" toast.
2. `soft_delete_purchase_bill` does the negative-stock check, stock reversal, batch_stock update, audit insert and child soft-delete inside one statement. On a 5,000-line bill this can exceed the PostgREST 60-second statement timeout, returning a generic failure. The user reads it as "not allowed".

Even if it succeeded, soft-delete only reverses stock; it does not remove the products/variants this import created in the product master, which is also part of the user's request.

## Plan

### Step 1 — One-off SQL cleanup (via approved migration / insert tool)

For the 3 bills above, scoped to `organization_id = KIDS ZONE`:

1. Re-verify guards in a single CTE: bill belongs to KIDS ZONE, `deleted_at IS NULL`, no sale_items on any of these barcodes/variant_ids, no purchase_returns referencing the bill, sum(qty) ≤ current stock_qty for every sku.
2. Reverse `product_variants.stock_qty` for every line (set-based UPDATE, aggregated by sku).
3. Delete matching `batch_stock` rows (`purchase_bill_id IN (...)`).
4. Insert `stock_movements` audit rows (`movement_type = 'hard_delete_purchase_excel_cleanup'`).
5. Soft-delete `voucher_entries` referencing the bills, then hard-delete `purchase_items` rows for these bills, then hard-delete the 3 `purchase_bills` rows. Hard delete (not soft) is required so the products step below can find them as fully orphaned.
6. Reverse any GL postings (`journal_entries` / `journal_lines` referencing these bill ids) if the accounting engine is enabled for the org.

### Step 2 — Prune orphan products & variants created by these imports

Only delete master rows that are now provably unused:

- A variant is orphaned if: no remaining `purchase_items` (any bill), no `sale_items`, no `sale_return_items`, no `purchase_return_items`, no `batch_stock`, `stock_qty = 0` after Step 1, and not referenced by any `delivery_challan_items` / `quotation_items` / `sale_order_items` / `customer_product_prices`.
- A product is orphaned if all its variants are orphaned by the same criteria and the product itself has no `product_images` left in use, no `customer_brand_discounts`, no `stock_alerts`.

Hard-delete orphan variants first, then orphan products. Variants/products that are also stocked from other bills (the ~9,511 we already counted) are left intact.

Output a final report: variants reversed, variants deleted, products deleted, GL reversals, and any rows skipped with the reason.

### Step 3 — Dashboard UX fix (small, code-only)

In `src/pages/PurchaseBillDashboard.tsx`:

- When `softDelete("purchase_bills", id)` rejects, surface the actual Postgres error message (currently the toast prints a generic "Failed to delete purchase bill" because `success === false` is thrown with no message).
- For bills with `purchase_items(count) > 1500`, replace the inline delete with a confirmation that warns "Large bill — this may take up to 60 seconds; if it times out, please contact support." This prevents the silent "not allowed" perception.

No change to RPC logic, no change to permissions model.

## Out of scope

- Re-importing corrected opening stock (separate task once these 3 bills are gone).
- Changing the soft-delete RPC to be chunked/async — possible future improvement, not needed for this one-off.

## Approval gate

Step 1 + Step 2 will be issued as a single `supabase--insert` transactional script that the user must approve in the dialog before it runs. Step 3 is a small code-only patch applied after Steps 1–2 succeed.

## Question for you before I start

Do you want me to **hard-delete** the bills (gone forever, products/variants pruned as above) or **soft-delete** them into the Recycle Bin (stock reversed, but bills and products remain restorable)? My plan above assumes hard-delete because you said "delete with stock & product master".
