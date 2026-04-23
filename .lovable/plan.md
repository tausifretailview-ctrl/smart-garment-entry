

## Fix three accounting bugs in supplier/purchase ledger system

### Fix 1 — Dedupe credit_note voucher creation in `AdjustCreditNoteDialog.tsx`

Currently when adjusting an old purchase return whose `credit_note_id` is null, both the **"Adjust Against Bill"** and **"Adjust in Outstanding"** branches blindly INSERT a new `credit_note` voucher every time the dialog is applied. Repeated clicks (or re-opening the dialog after a save) creates duplicate `SCN-XXXXX` vouchers, each one subtracting the credit amount again from the supplier balance.

**Change** (`src/components/AdjustCreditNoteDialog.tsx`): before inserting a new `credit_note` voucher in the `bill` and `outstanding` branches, run a guard query:

```ts
const { data: existing } = await supabase
  .from('voucher_entries')
  .select('id')
  .eq('organization_id', currentOrganization.id)
  .eq('voucher_type', 'credit_note')
  .eq('reference_type', 'supplier')
  .eq('reference_id', supplierId)
  .eq('total_amount', creditAmount)
  .is('deleted_at', null)
  .or(`description.ilike.%${creditNoteNumber}%,description.ilike.%${selectedBill?.supplier_invoice_no ?? ''}%`)
  .limit(1)
  .maybeSingle();

if (existing) {
  // update description + link existing voucher to PR, do NOT insert
  await supabase.from('voucher_entries').update({ description: ... }).eq('id', existing.id);
  await supabase.from('purchase_returns').update({ credit_note_id: existing.id }).eq('id', purchaseReturnId);
} else {
  // existing INSERT path
}
```

Also re-check `purchase_returns.credit_note_id` at the start of `handleApply` (re-fetch by `purchaseReturnId`) so a second click after a successful save sees the now-linked voucher and skips the insert entirely.

### Fix 2 — Stop double-counting pending purchase returns in `SupplierLedger.tsx`

Today `unreflectedReturnsBySupplier` (line 120-126) subtracts every purchase return that has no linked `credit_note_id`. This fires even for **pending** returns (no adjustment decided yet), which means the supplier balance drops the moment a return is entered, before any credit note / refund / outstanding adjustment exists. That double-counts against the actual pending-bill balance and corrupts the summary card.

**Changes** (`src/components/SupplierLedger.tsx`):

1. In the `allPurchaseReturns` query (line 113), also select `credit_status`.
2. In the unreflected aggregator (line 121), only count returns where the user has explicitly chosen an adjustment that affects balance:
   ```ts
   if ((!pr.credit_note_id || !allCreditNoteVoucherIds.has(pr.credit_note_id))
       && ['adjusted', 'adjusted_outstanding', 'refunded'].includes(pr.credit_status)) { ... }
   ```
   Pending returns are excluded from the balance calculation.
3. In the per-supplier transactions block (line 276), apply the same `credit_status` filter to `unreflectedReturns` so pending PRs still appear in the ledger as **display-only rows with debit = 0** (informational), not subtracting from `runningBalance`. Add a new branch:
   ```ts
   } else if (item.type === 'purchase_return' && pr.credit_status === 'pending') {
     // display-only row, do NOT mutate runningBalance
     allTransactions.push({ ..., debit: 0, credit: 0, balance: runningBalance,
       description: `Purchase Return - ${pr.return_number} (Pending — not adjusted)` });
   }
   ```

This keeps pending returns visible in the ledger for awareness but stops them from changing the balance until the user picks **Adjust Against Bill / Outstanding / Refund**.

### Fix 3 — Cascade CN-adjustment vouchers on sale soft-delete / restore

New migration replacing `soft_delete_sale` and `restore_sale`. Current functions only touch vouchers with `reference_type = 'sale'`, leaving CN-adjustment receipts (which have `reference_type = 'customer'` but mention the invoice number in their description) orphaned in the customer ledger after a sale is recycled.

**New migration** (`supabase/migrations/<timestamp>_cascade_sale_voucher_delete.sql`):

```sql
CREATE OR REPLACE FUNCTION public.soft_delete_sale(p_sale_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_item RECORD; v_org_id uuid; v_sale_number text;
  v_remaining_qty INTEGER; v_batch RECORD;
BEGIN
  SELECT organization_id, sale_number INTO v_org_id, v_sale_number
    FROM sales WHERE id = p_sale_id;

  -- Stock restoration (unchanged)
  FOR v_item IN ... LOOP ... END LOOP;

  UPDATE sale_items SET deleted_at = now(), deleted_by = p_user_id
    WHERE sale_id = p_sale_id;

  -- Direct vouchers
  UPDATE voucher_entries SET deleted_at = now(), deleted_by = p_user_id
    WHERE reference_id = p_sale_id
      AND reference_type IN ('sale','invoice')
      AND deleted_at IS NULL;

  -- CN/receipt vouchers linked via description (reference_type='customer')
  UPDATE voucher_entries SET deleted_at = now(), deleted_by = p_user_id
    WHERE organization_id = v_org_id
      AND v_sale_number IS NOT NULL
      AND description ILIKE '%' || v_sale_number || '%'
      AND voucher_type IN ('receipt','credit_note')
      AND deleted_at IS NULL;

  UPDATE sales SET deleted_at = now(), deleted_by = p_user_id WHERE id = p_sale_id;
END; $$;
```

Mirror the same two UPDATEs in `restore_sale` (setting `deleted_at = NULL`, `deleted_by = NULL`) using the sale's `organization_id` + `sale_number` lookup, immediately after the existing `reference_type = 'sale'` restore.

### Fix 4 — Rani Sarees one-time cleanup: SKIP

I checked the database. There is **no organization** matching `'%rani%'` or `'%total it infra%'`, and no `voucher_entries` rows with `voucher_number` `VCH/25-26/2` or `VCH/25-26/14` in any matching org. The cleanup INSERT/UPDATE would be a no-op, so I will not create the migration. If you need this run on a different org name or another database, share the correct organization name and I'll add it.

### Files

- **Edit**: `src/components/AdjustCreditNoteDialog.tsx` (Fix 1)
- **Edit**: `src/components/SupplierLedger.tsx` (Fix 2)
- **New migration**: `supabase/migrations/<ts>_cascade_sale_voucher_delete.sql` (Fix 3)

### Out of scope (explicitly not touched)

Purchase save flow, sale save flow, POS save flow, any other RPCs.

