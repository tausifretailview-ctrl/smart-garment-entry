## Finding from investigation
- Printed photo shows `POS/26-27/1576`, customer `SANGITA KALE`, amount `₹82,900`, product `IPHONE 17 ... LAVENDER`, date `17-06-2026`.
- Database record for `POS/26-27/1576` is different: `MOHAMMAD TABREJ SHAIKH`, amount `₹3,500`, product `STUFFCOOL`, saved at `15:11`.
- Database record for `SANGITA KALE` is `POS/26-27/1577`, amount `₹2,000`, product `APPLE 20W ADAPTER`, saved at `15:14`.
- The exact printed bill item/barcode `357330776570608` is not saved in sales, so the print came from stale/front-end invoice data or an estimate/direct print path, not from the persisted sale row.

## Plan
1. Remove unsafe POS draft/estimate printing behavior
   - Make the desktop Print button print only the last saved invoice snapshot, not the live cart/draft.
   - Clearly disable or guard Print when there is no saved invoice available.
   - Keep Estimate as the only intentional no-save print path, labelled separately.

2. Harden saved-bill print data
   - After save, print from the returned sale ID/number snapshot only.
   - Prevent stale `savedInvoiceData` from being reused after New/Clear/failed save.
   - Ensure the print confirmation dialog cannot print an old bill if the current save failed or was blocked.

3. Fix POS Details visibility after saving
   - Ensure POS dashboard/details refreshes immediately after save, print, cancel, or auto-print success.
   - Keep search by invoice number working across date filters so `POS/26-27/1576`/`1577` can always be found.

4. Add diagnostic logging for this daily issue
   - Log a compact client-side warning when printed invoice number/customer/amount does not match the saved sale snapshot.
   - This will help catch any remaining stale print cases without exposing sensitive data.

5. Verify with Mulund Mobility evidence
   - Re-query saved rows for `POS/26-27/1576`, `1577`, and the uploaded bill details.
   - Validate the code path so a printed final invoice must correspond to an existing saved sale record before printing.