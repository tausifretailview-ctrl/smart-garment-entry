-- Add credit note tracking columns to purchase_returns table
ALTER TABLE purchase_returns 
  ADD COLUMN IF NOT EXISTS credit_note_id UUID REFERENCES voucher_entries(id),
  ADD COLUMN IF NOT EXISTS linked_bill_id UUID REFERENCES purchase_bills(id),
  ADD COLUMN IF NOT EXISTS credit_status TEXT DEFAULT 'pending';

-- Add comment for clarity
COMMENT ON COLUMN purchase_returns.credit_status IS 'Status: pending, adjusted, refunded';
COMMENT ON COLUMN purchase_returns.credit_note_id IS 'Link to auto-created credit note voucher';
COMMENT ON COLUMN purchase_returns.linked_bill_id IS 'Optional link to original purchase bill';