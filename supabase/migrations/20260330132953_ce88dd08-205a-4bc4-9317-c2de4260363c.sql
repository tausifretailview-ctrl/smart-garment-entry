
ALTER TABLE public.sale_financer_details
  ADD COLUMN IF NOT EXISTS bank_transfer_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS finance_discount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS down_payment_mode text DEFAULT 'cash';
