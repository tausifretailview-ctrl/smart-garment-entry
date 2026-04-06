
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS shop_name TEXT;
ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS shop_name TEXT;
