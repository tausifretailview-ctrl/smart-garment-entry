-- Add credit note tracking fields to sale_returns table
ALTER TABLE public.sale_returns 
ADD COLUMN IF NOT EXISTS credit_note_id UUID REFERENCES public.voucher_entries(id),
ADD COLUMN IF NOT EXISTS credit_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS linked_sale_id UUID REFERENCES public.sales(id);

-- Add comment for clarity
COMMENT ON COLUMN public.sale_returns.credit_status IS 'Status: pending, adjusted, refunded, adjusted_outstanding';
COMMENT ON COLUMN public.sale_returns.linked_sale_id IS 'The sale invoice against which credit was adjusted';