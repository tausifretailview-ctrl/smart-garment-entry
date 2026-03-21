

## Fix: Payment History Query Includes Deleted Sales

**Problem**: Line 384-388 in `CustomerHistoryDialog.tsx` fetches sale IDs without filtering out deleted or delivery challan records. This causes payments from other customers (linked to reused/cancelled invoice IDs) to appear under the wrong customer.

**Change**: Single edit in `src/components/CustomerHistoryDialog.tsx`, lines 384-388.

Add `.is('deleted_at', null)` and `.not('sale_type', 'eq', 'delivery_challan')` to the sales query inside the payment history `queryFn`:

```typescript
const { data: sales } = await supabase
  .from('sales')
  .select('id')
  .eq('customer_id', customerId)
  .eq('organization_id', organizationId)
  .is('deleted_at', null)
  .not('sale_type', 'eq', 'delivery_challan');
```

This aligns the payment query's sale filtering with the existing sales tab query (line 371) which already filters `deleted_at`.

