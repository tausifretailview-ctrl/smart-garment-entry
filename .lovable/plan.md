

# Fix: Organization Reset Not Deleting Data

## Problem

The reset shows "success" but no data is actually deleted. The root cause is that 9 child/item tables (`sale_items`, `sale_return_items`, `purchase_items`, `purchase_return_items`, `quotation_items`, `sale_order_items`, `purchase_order_items`, `delivery_challan_items`, `voucher_items`) do **not** have an `organization_id` column. The edge function skips these tables, then fails to delete parent tables (`sales`, `purchase_bills`, etc.) because child rows still reference them via foreign keys. Since the function catches errors silently and still returns `success: true`, the UI shows a success message.

## Solution

Update the `reset-organization` edge function to handle item tables by deleting through their parent relationship. For example, delete `sale_items` WHERE `sale_id` IN (SELECT `id` FROM `sales` WHERE `organization_id` = X).

## Technical Details

### File to modify
- `supabase/functions/reset-organization/index.ts`

### Changes

1. **Replace the flat table list with a structured configuration** that maps each item table to its parent table and foreign key column:

```text
Item Table               -> Parent Table       -> FK Column
sale_items               -> sales              -> sale_id
sale_return_items        -> sale_returns        -> sale_return_id
purchase_items           -> purchase_bills      -> purchase_bill_id
purchase_return_items    -> purchase_returns    -> purchase_return_id
quotation_items          -> quotations          -> quotation_id
sale_order_items         -> sale_orders         -> sale_order_id
purchase_order_items     -> purchase_orders     -> purchase_order_id
delivery_challan_items   -> delivery_challans   -> delivery_challan_id
voucher_items            -> (needs investigation) -> voucher_id or similar
```

2. **Delete item tables using raw SQL** via `adminClient.rpc` or direct SQL, since the Supabase JS client cannot do subquery-based deletes. The function will run:

```sql
DELETE FROM sale_items 
WHERE sale_id IN (SELECT id FROM sales WHERE organization_id = $1)
```

3. **After item tables are cleared**, proceed with the existing logic to delete parent tables using `.eq("organization_id", orgId)`.

4. **Improve error handling**: If critical parent table deletions fail, mark the result as `success: false` instead of returning success with errors array.

### Deletion sequence

```text
Phase 1 - Item tables (via parent join):
  sale_items, sale_return_items, purchase_items, purchase_return_items,
  quotation_items, sale_order_items, purchase_order_items,
  delivery_challan_items, voucher_items

Phase 2 - Tables with organization_id (direct delete):
  stock_movements, batch_stock, delivery_tracking,
  sale_returns, purchase_returns, sales, purchase_bills,
  quotations, sale_orders, purchase_orders, delivery_challans,
  credit_notes, customer_advances, customer_brand_discounts,
  customer_product_prices, customer_points_history, gift_redemptions,
  product_images, product_variants, products, customers, suppliers,
  size_groups, employees, legacy_invoices, drafts,
  whatsapp_messages, whatsapp_conversations, whatsapp_logs, sms_logs

Phase 3 - Sequence resets:
  barcode_sequence (update), bill_number_sequence (delete)
```

### No frontend changes needed
The hook and dialog already work correctly. Only the edge function logic needs updating.
