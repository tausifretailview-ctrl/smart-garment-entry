

## Invoice Cancel + Hard Delete Implementation

### Database Migration
Add cancellation columns to `sales` table and create `cancel_invoice` RPC function as specified in the user's SQL. This handles atomic cancellation: deletes sale_items (triggering stock restore), marks invoice as cancelled, and nullifies linked vouchers.

### Code Changes in `SalesInvoiceDashboard.tsx`

1. **Destructure `hardDelete`** from `useSoftDelete()` (line 500)

2. **Add state variables** for cancel and hard delete flows (after line 112):
   - `invoiceToCancel`, `cancelReason`, `isCancelling`
   - `invoiceToHardDelete`, `isHardDeleting`

3. **Add `handleCancelInvoice`** function — calls `supabase.rpc('cancel_invoice', ...)`, shows toast, refetches

4. **Add `handleHardDeleteInvoice`** function — calls `hardDelete('sales', id)`, shows toast, refetches

5. **Replace single "Delete Invoice"** menu item (lines 253-259) with separator + "Cancel Invoice" (icon: `Ban`) + "Permanently Delete" (icon: `Trash2`). Cancel disabled if already cancelled.

6. **Add CANCELLED badge** next to payment status badge for cancelled invoices, plus row dimming with `opacity-55 bg-red-50/30`

7. **Filter cancelled invoices from page totals** — wrap `pageTotals` reduce calls to skip `is_cancelled` invoices

8. **Add Cancel Invoice Dialog** — Dialog with reason textarea, amber warning about stock restoration, orange confirm button

9. **Add Permanently Delete Dialog** — AlertDialog with destructive styling, warning that it's irreversible and only for test data

10. **Imports** — `AlertTriangle` from lucide-react (Ban, Trash2, Loader2 already imported). Dialog/Textarea/AlertDialog already imported.

### Technical Notes
- Stock restoration uses the existing `handle_sale_item_delete` trigger — no new stock logic needed
- Cancelled invoices remain visible in the list with a red CANCELLED badge and dimmed row
- The `cancel_invoice` RPC is `SECURITY DEFINER` and uses `auth.uid()` for the `cancelled_by` field
- The existing soft-delete dialog (lines 1915-1937) will be replaced by the two new dialogs

