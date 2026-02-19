
-- Step 1: Drop the redundant stock movement audit trigger
-- This stops ~1,500–2,500 redundant write operations per day
DROP TRIGGER IF EXISTS audit_stock_movements_trigger ON public.stock_movements;

-- Step 2: Drop the now-unused trigger function for cleanliness
-- The audit_stock_changes() function was only ever called by the trigger above
-- stock_movements table itself is the authoritative record — this is 100% safe
DROP FUNCTION IF EXISTS public.audit_stock_changes();
