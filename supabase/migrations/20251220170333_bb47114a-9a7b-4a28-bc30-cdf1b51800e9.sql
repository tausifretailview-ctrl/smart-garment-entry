-- Drop the old function without the prefix parameter to fix ambiguity
DROP FUNCTION IF EXISTS public.generate_sale_number(uuid);