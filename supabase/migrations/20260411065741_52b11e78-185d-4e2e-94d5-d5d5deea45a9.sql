ALTER TABLE public.product_variants DROP CONSTRAINT stock_not_negative;
UPDATE public.product_variants SET stock_qty = 0 WHERE stock_qty < 0;
ALTER TABLE public.product_variants ADD CONSTRAINT stock_not_negative CHECK (stock_qty >= 0);