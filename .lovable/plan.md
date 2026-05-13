## Goal

Make the Sale Return Dashboard "Adjust Credit Note" flow reliable across every organization with only two adjustment modes — **Adjust Against Invoice(s)** and **Refund** — and ensure customer balance + ledger + GL stay correctly in sync.

## Findings (current state)

1. **Icon visibility too restrictive.** In `SaleReturnDashboard.tsx` (line 755 predicate), the purple Adjust-CN icon is hidden when `refund_type` is `cash_refund` or `exchange`, even if `credit_available_balance > 0`. Result: rows with leftover credit can't be adjusted.
2. **Outstanding mode has real bugs** (currently the 3rd option):
   - If the return has no `linked_sale_id`, it just flips status to `adjusted_outstanding` and writes nothing — CN is "consumed" but customer outstanding is NOT actually reduced.
   - When linked, partial outstanding adjusts don't recalc `credit_available_balance` for the leftover.
   - Per your direction, this mode is being removed entirely.
3. **Refund mode** works (creates `PAY-` voucher, sets `credit_available_balance = 0`, `credit_status = 'refunded'`), but does NOT write a `customer_ledger_entries` row, so the new Customer Account Statement report misses it.
4. **Invoice mode** (via `applyInvoiceAllocationsViaRpc`) updates `sales.sale_return_adjust`, creates `RCP-` vouchers per invoice, posts journal entries, and decrements `credit_available_balance` — this is the healthy path.

## Changes

### 1. `src/components/AdjustCustomerCreditNoteDialog.tsx`
- Change `adjustmentType` union from `"invoice" | "refund" | "outstanding"` → `"invoice" | "refund"`.
- Remove the third RadioGroup option ("Adjust in Outstanding Balance") and its description block.
- Remove the entire `else if (adjustmentType === "outstanding") { ... }` branch (lines ~502–635) and any related helper code that only that branch uses.
- Refund branch: after the `PAY-` voucher insert + `sale_returns` update, also call `insertLedgerCredit` (from `@/lib/customerLedger`) so the Customer Account Statement reflects the refund as a debit-side cash payment to the customer (voucher type `PAYMENT`, amount = `liveCn`, particulars = `Refund for Sale Return ${returnNumber}`).
- Default `adjustmentType` stays `"invoice"`.

### 2. `src/pages/SaleReturnDashboard.tsx`
- Loosen the Adjust-CN icon visibility predicate (line ~755):
  - Drop the `refund_type === 'credit_note' || !refund_type` requirement.
  - Drop the `credit_status === 'adjusted_outstanding'` early return (no longer reachable for new returns; for legacy rows with leftover balance the icon should appear).
  - Keep: `customer_id` present AND `bal > 0` AND status not `refunded`.
- For status `adjusted` + `linked_sale_id`, still require `remaining_cn_amt > 0` (unchanged).

### 3. Legacy data (no migration needed)
Existing returns that already sit at `credit_status = 'adjusted_outstanding'` keep that status. With the new icon predicate, if their `credit_available_balance > 0` the user can re-adjust the leftover via Invoice or Refund. No data backfill needed.

## Accounting verification (after changes)

| Mode | sales.sale_return_adjust | voucher_entries | journal_entries (if engine on) | sale_returns.credit_available_balance | customer_ledger_entries |
|---|---|---|---|---|---|
| Invoice (per-invoice) | +adjustAmount per invoice | RCP- per invoice | CustomerCreditNoteApplication per voucher | decremented to remainder | already written by RPC path |
| Refund | n/a | PAY- once | (cash refund handled by existing payment GL) | set to 0 | NEW: PAYMENT credit row added |

Customer balance (`useCustomerBalance` / `reconcile_customer_balances`) reads from `sales`, `voucher_entries`, `customer_advances`, `sale_returns.credit_available_balance` — all of which the two remaining flows update correctly.

## Out of scope
- No DB schema migration.
- No changes to `SaleReturnEntry.tsx`, `useCustomerBalance`, or the receipt RPC.
- No retroactive cleanup of historical `adjusted_outstanding` rows.
