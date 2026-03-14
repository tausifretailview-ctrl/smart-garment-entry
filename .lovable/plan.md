

## Issue: Invoice Cancellation Fails Due to Check Constraint

The `cancel_invoice` RPC function sets `payment_status = 'cancelled'`, but the `sales` table has a check constraint that only permits: `pending`, `partial`, `completed`, `hold`. The constraint violation is caught by the function's EXCEPTION handler and returned as a failure.

## Root Cause

Migration `20251208124151` defines:
```sql
CHECK (payment_status IN ('pending', 'partial', 'completed', 'hold'))
```

The cancel RPC (line 54) tries: `payment_status = 'cancelled'` → constraint violation → error caught → returns `{success: false}`.

## Fix

**Database migration** — Drop and recreate the constraint to include `'cancelled'`:

```sql
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_payment_status_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_payment_status_check 
  CHECK (payment_status IN ('pending', 'partial', 'completed', 'hold', 'cancelled'));
```

Single migration, no code changes needed. The existing RPC and dashboard code will work correctly once the constraint allows the `'cancelled'` value.

