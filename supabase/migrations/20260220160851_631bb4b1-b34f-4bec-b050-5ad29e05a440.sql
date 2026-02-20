-- Fix 1: FIFO performance index — excludes zero-quantity rows, accelerating FIFO batch_stock lookups
CREATE INDEX IF NOT EXISTS idx_batch_stock_variant_qty 
ON public.batch_stock(variant_id, purchase_date) 
WHERE quantity > 0;

-- Fix 3 (DB part): WhatsApp PDF minimum amount threshold column
ALTER TABLE public.whatsapp_api_settings 
ADD COLUMN IF NOT EXISTS pdf_min_amount numeric DEFAULT 0;