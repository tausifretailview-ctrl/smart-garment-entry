-- Add discount columns to voucher_entries table
ALTER TABLE voucher_entries ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0;
ALTER TABLE voucher_entries ADD COLUMN IF NOT EXISTS discount_reason TEXT;