

## Plan: Tighten Stock Constraint to >= 0

### Single Migration

One migration file that executes three statements in order:

1. `ALTER TABLE public.product_variants DROP CONSTRAINT stock_not_negative;`
2. `UPDATE public.product_variants SET stock_qty = 0 WHERE stock_qty < 0;`
3. `ALTER TABLE public.product_variants ADD CONSTRAINT stock_not_negative CHECK (stock_qty >= 0);`

No code changes needed — service/combo products are already handled by existing DB triggers and `useStockValidation`.

