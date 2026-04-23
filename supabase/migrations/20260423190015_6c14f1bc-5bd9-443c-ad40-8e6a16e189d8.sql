ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS user_cancelled_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_products_user_cancelled
ON public.products (organization_id, user_cancelled_at)
WHERE user_cancelled_at IS NOT NULL;