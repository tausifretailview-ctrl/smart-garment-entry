-- Drop the global unique constraint on sale_number (it's a constraint, not just an index)
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_sale_number_key;

-- Create organization-scoped unique constraint
-- This allows each organization to have independent invoice numbering (e.g., POS/25-26/1 can exist for multiple organizations)
CREATE UNIQUE INDEX sales_organization_sale_number_key 
ON public.sales USING btree (organization_id, sale_number);