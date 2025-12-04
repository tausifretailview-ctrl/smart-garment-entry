-- Fix quotation_number to be organization-scoped
ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_quotation_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS quotations_organization_quotation_number_key 
ON public.quotations USING btree (organization_id, quotation_number);

-- Fix order_number to be organization-scoped
ALTER TABLE public.sale_orders DROP CONSTRAINT IF EXISTS sale_orders_order_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS sale_orders_organization_order_number_key 
ON public.sale_orders USING btree (organization_id, order_number);

-- Fix return_number to be organization-scoped (sale_returns)
ALTER TABLE public.sale_returns DROP CONSTRAINT IF EXISTS sale_returns_return_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS sale_returns_organization_return_number_key 
ON public.sale_returns USING btree (organization_id, return_number);