-- Add payment_method column to voucher_entries
ALTER TABLE public.voucher_entries ADD COLUMN payment_method text;

-- Backfill from description for existing records
UPDATE public.voucher_entries
SET payment_method = CASE
  WHEN description ILIKE '%Cheque No:%' THEN 'cheque'
  WHEN description ILIKE '%Transaction ID:%' THEN 'upi'
  ELSE 'cash'
END
WHERE voucher_type = 'receipt' AND payment_method IS NULL AND deleted_at IS NULL;