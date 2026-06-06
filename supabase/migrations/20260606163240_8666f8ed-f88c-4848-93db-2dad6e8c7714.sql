-- Phase 1 fix: re-add purchase_returns.credit_available_balance.
-- Original migration 20260510120001 did not take effect in the live DB,
-- causing repeated "column does not exist" errors in supplier CN flows.

ALTER TABLE public.purchase_returns
  ADD COLUMN IF NOT EXISTS credit_available_balance NUMERIC;

COMMENT ON COLUMN public.purchase_returns.credit_available_balance IS
  'Remaining supplier CN amount when partially applied to a bill (mirrors sale_returns pattern). NULL means use net_amount.';

UPDATE public.purchase_returns
SET credit_available_balance = net_amount
WHERE credit_available_balance IS NULL
  AND deleted_at IS NULL
  AND (credit_status IS NULL OR credit_status = 'pending');