## Problem

On the Sale Return Dashboard, customer-linked sale returns with a credit note (status `pending` or `partially_adjusted`) often don't show the **Adjust against invoice** (purple CN icon) and **Refund to customer** (green cash icon) buttons.

Two real bugs were found from the live data:

1. **Stale `credit_available_balance` on `sale_returns`.**
   Example: `SR/26-27/35` stores `credit_available_balance = 200`, but the linked `credit_notes` row shows `credit_amount 6200 − used_amount 0 = 6200` remaining. The dashboard trusts the stale column and hides/under-reports the Adjust button balance.

2. **`bal` falls through to `0` when there is no linked sale.**
   In `SaleReturnDashboard.tsx`:
   ```ts
   const bal = ret.credit_available_balance != null
     ? Number(ret.credit_available_balance)
     : (ret.remaining_cn_amt ?? Number(ret.net_amount));
   ```
   `remaining_cn_amt` is computed earlier as `0` when there's no `linked_sale_id` (not null), so `??` does NOT fall through to `net_amount`. Result: rows like `SR/26-27/94` (₹11,938.70) and `SR/26-27/93` (₹7,370.80) — both customer-linked and fully open — get `bal = 0` and the Adjust button is hidden. Refund still shows because that branch uses `net_amount` directly.

## Fix

Edit only `src/pages/SaleReturnDashboard.tsx`.

### 1. Fetch live CN remaining for visible rows

In the existing list query (around the `linkedSales` enrichment, lines ~250-297), after collecting `linkedSaleIds`, also collect `creditNoteIds` from `returnsList.map(r => r.credit_note_id)`. If any, fetch:

```ts
supabase.from('credit_notes')
  .select('id, credit_amount, used_amount, status')
  .in('id', creditNoteIds)
  .eq('organization_id', currentOrganization.id)
```

Build `cnMap[id] = max(0, credit_amount - used_amount)`. Pass it into the `enriched` mapper and add a derived field, e.g. `cn_live_remaining`.

### 2. Compute the true available balance once

Add a small helper inside the component (or inline):

```ts
const getAvailableCN = (ret) => {
  // 1. Live CN row is the source of truth when a CN exists
  if (ret.credit_note_id && ret.cn_live_remaining != null) {
    return ret.cn_live_remaining;
  }
  // 2. Linked-to-sale return: remaining after sale_return_adjust
  if (ret.linked_sale_id) {
    return ret.remaining_cn_amt ?? 0;
  }
  // 3. Pending / no CN yet: full net amount
  return Number(ret.net_amount || 0);
};
```

Use it in three places:
- The Adjust-button visibility block (lines ~755-768): replace the `bal` calculation with `getAvailableCN(ret)`.
- The Refund-button visibility block (lines ~781-810): replace `refundableAmt` with `getAvailableCN(ret)`.
- The Adjust-dialog `availableBalance` prop (lines ~923-927).

Keep all current guards (`status !== 'refunded'`, `customer_id` required, status filter for refund, etc.) — user confirmed walk-in (no customer) rows should stay hidden.

### 3. Self-heal stale `credit_available_balance`

When a row has `credit_note_id`, `cn_live_remaining` differs from `credit_available_balance` by more than ₹0.01, and the user is just viewing the dashboard, fire-and-forget update:

```ts
supabase.from('sale_returns')
  .update({ credit_available_balance: cn_live_remaining })
  .eq('id', ret.id)
  .eq('organization_id', currentOrganization.id)
```

Run this once after the enrichment step (batched, no `await` blocking render). This keeps the stored column in sync going forward without a separate migration.

## Out of scope

- No DB migrations.
- No changes to `AdjustCustomerCreditNoteDialog` or refund-write logic — only visibility/availability inputs change.
- No new buttons or columns.

## Files changed

- `src/pages/SaleReturnDashboard.tsx`
