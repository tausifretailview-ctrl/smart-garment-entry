-- Per-row CHECK on customer_advances (NOT VALID until historical repair + VALIDATE).
-- Apply in a quiet window — ALTER TABLE takes AccessExclusiveLock and can 40P01
-- deadlock with heavy POS / advance_apply if run in the same batch as trigger DDL.

ALTER TABLE public.customer_advances
  DROP CONSTRAINT IF EXISTS chk_customer_advances_used_within_amount;

ALTER TABLE public.customer_advances
  ADD CONSTRAINT chk_customer_advances_used_within_amount
  CHECK (used_amount <= amount + 0.5) NOT VALID;

COMMENT ON CONSTRAINT chk_customer_advances_used_within_amount ON public.customer_advances IS
  'Single booking: used_amount must not exceed amount (+₹0.5). NOT VALID until VALIDATE CONSTRAINT after data repair.';
