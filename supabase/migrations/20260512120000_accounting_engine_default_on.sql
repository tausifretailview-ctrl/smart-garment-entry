-- Accounting engine on by default for all orgs (new + existing).

UPDATE public.settings
SET accounting_engine_enabled = true
WHERE accounting_engine_enabled IS DISTINCT FROM true;

ALTER TABLE public.settings
  ALTER COLUMN accounting_engine_enabled SET DEFAULT true;
