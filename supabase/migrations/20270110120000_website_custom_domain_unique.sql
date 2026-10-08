-- Store website custom domains (Settings → WhatsApp → Store website domain).
-- The storefront resolves the visiting host via website_settings.custom_domain,
-- so one domain must belong to only one organization. The app saves domains
-- lowercase without "www."; normalise any older values the same way first.

UPDATE public.website_settings
SET custom_domain = NULLIF(regexp_replace(lower(btrim(custom_domain)), '^www\.', ''), '')
WHERE custom_domain IS NOT NULL
  AND custom_domain IS DISTINCT FROM NULLIF(regexp_replace(lower(btrim(custom_domain)), '^www\.', ''), '');

CREATE UNIQUE INDEX IF NOT EXISTS website_settings_custom_domain_key
  ON public.website_settings (custom_domain)
  WHERE custom_domain IS NOT NULL;
