
ALTER TABLE public.purchase_returns
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(6,2) NOT NULL DEFAULT 0;

UPDATE public.purchase_returns
SET gross_amount = 40505.00,
    discount_percent = 10,
    discount_amount = 4050.50,
    gst_amount = 1822.73,
    net_amount = 38277.23
WHERE id = '77fbf463-0f09-4c40-94fb-afbe00cc0971';
