

## Fix: Balance Adjustment Delete/Modify Not Working

### Root Cause
The `customer_balance_adjustments` table has only **SELECT** and **INSERT** RLS policies. There are **no UPDATE or DELETE policies**, so all update/delete operations silently succeed with 0 rows affected — the toast shows "success" but nothing changes in the database.

### Fix
Add UPDATE and DELETE RLS policies for organization members via a database migration:

```sql
CREATE POLICY "Org members can update adjustments"
ON public.customer_balance_adjustments
FOR UPDATE
USING (public.user_belongs_to_org(auth.uid(), organization_id))
WITH CHECK (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Org members can delete adjustments"
ON public.customer_balance_adjustments
FOR DELETE
USING (public.user_belongs_to_org(auth.uid(), organization_id));
```

### Additional Code Fix
In `RecentBalanceAdjustments.tsx`, add validation after delete/update to confirm rows were actually affected, so the UI doesn't show false success messages.

### Files Changed
- **Migration**: New SQL migration for UPDATE and DELETE RLS policies
- **Edit**: `src/components/RecentBalanceAdjustments.tsx` — add row-count validation after mutations

