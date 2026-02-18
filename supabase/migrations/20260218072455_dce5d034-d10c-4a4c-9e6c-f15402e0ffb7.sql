-- Add refund_type column to sale_returns table
-- Values: 'credit_note' (default), 'cash_refund', 'exchange'
ALTER TABLE public.sale_returns
ADD COLUMN refund_type TEXT NOT NULL DEFAULT 'credit_note';

-- Add a comment for clarity
COMMENT ON COLUMN public.sale_returns.refund_type IS 'Type of refund: credit_note, cash_refund, or exchange';