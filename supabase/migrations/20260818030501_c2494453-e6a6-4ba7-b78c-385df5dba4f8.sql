CREATE OR REPLACE FUNCTION public._canary_default_priv_check2()
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT 'canary2'::text $$;