## Findings
- Lovable Cloud backend is healthy.
- Hivaa Collection product shown in the screenshot (`KURTI SHORT`, barcode `4`) has valid product data: active product/variant, HSN `62114200`, GST `5%`, stock available.
- Exclusive GST calculation is straightforward frontend math and is unlikely to cause the timeout.
- The risk is the **Sales Invoice page**: it still inserts `sale_items` directly, while the other sale-save paths already use the timeout-safe `insertSaleItemsInChunks()` helper.
- Sale item insert triggers stock deduction, batch stock update, stock movement insert, customer price memory, and total quantity update. If any trigger path is slow, the direct invoice insert surfaces as `canceling statement due to statement timeout`.

## Plan
1. **Make Sales Invoice use the timeout-safe insert helper**
   - Import `insertSaleItemsInChunks`, `isStatementTimeoutError`, and `saleSaveTimeoutMessage` in `src/pages/SalesInvoice.tsx`.
   - Replace direct `.from('sale_items').insert(...)` calls in both new invoice and edit invoice paths with `insertSaleItemsInChunks(...)`.

2. **Show a clear retry message for timeout errors**
   - In the Sales Invoice save `catch`, detect statement timeout errors and show: “Saving took too long (server busy). Please wait a few seconds and try again.”
   - Keep existing error logging and rollback behavior.

3. **Keep scope limited**
   - Do not change product entry or GST formulas because the inspected product/GST data does not indicate a product-entry or Exclusive GST issue.
   - No database schema change unless testing reveals the timeout still comes from a backend trigger/query after this frontend save-path fix.

## Validation
- Verify the updated file references the shared helper and no direct `sale_items` insert remains in the Sales Invoice save paths.
- Let the app’s automatic TypeScript/build check validate the import and type usage.