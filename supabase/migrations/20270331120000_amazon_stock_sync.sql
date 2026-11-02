-- Amazon stock sync, step 1: Ezzy stock pushed to the shop's Amazon.in listings.
-- Only for shops that Platform Admin gave the "amazon_sync" feature AND that turned the
-- switch on in /amazon-sync. For every other shop the stock trigger below returns after
-- one primary-key lookup and nothing else changes.
--
-- amazon_channel_settings  one row per shop: switch, Seller ID, last sync status.
-- amazon_channel_secrets   Amazon app keys + refresh token. No policies: only the
--                          amazon-sync edge function (service role) reads or writes it.
-- amazon_sku_map           Amazon SKU -> Ezzy product + colour + size (all barcodes of that
--                          size are summed, so per-piece barcodes work), safety buffer,
--                          needs_push + stock_changed_at set by the stock trigger; the
--                          edge function clears needs_push only if stock_changed_at is
--                          unchanged since it read the row, so no change is lost.

CREATE TABLE IF NOT EXISTS public.amazon_channel_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  seller_id text,
  marketplace_id text NOT NULL DEFAULT 'A21TJRUUN4KGV',
  default_buffer integer NOT NULL DEFAULT 0,
  has_keys boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  last_sync_ok boolean,
  last_sync_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.amazon_channel_settings DROP CONSTRAINT IF EXISTS amazon_channel_settings_buffer_check;
ALTER TABLE public.amazon_channel_settings
  ADD CONSTRAINT amazon_channel_settings_buffer_check CHECK (default_buffer >= 0 AND default_buffer <= 1000);

ALTER TABLE public.amazon_channel_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view Amazon settings" ON public.amazon_channel_settings;
CREATE POLICY "Org members can view Amazon settings"
ON public.amazon_channel_settings FOR SELECT
USING (public.user_belongs_to_org(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Org admins can add Amazon settings" ON public.amazon_channel_settings;
CREATE POLICY "Org admins can add Amazon settings"
ON public.amazon_channel_settings FOR INSERT
WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role));

DROP POLICY IF EXISTS "Org admins can change Amazon settings" ON public.amazon_channel_settings;
CREATE POLICY "Org admins can change Amazon settings"
ON public.amazon_channel_settings FOR UPDATE
USING (public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role))
WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.amazon_channel_secrets (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  lwa_client_id text NOT NULL,
  lwa_client_secret text NOT NULL,
  refresh_token text NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.amazon_channel_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.amazon_channel_secrets FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.amazon_sku_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  seller_sku text NOT NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  color text,
  size text NOT NULL,
  barcode text,
  buffer_qty integer,
  active boolean NOT NULL DEFAULT true,
  needs_push boolean NOT NULL DEFAULT true,
  stock_changed_at timestamptz NOT NULL DEFAULT now(),
  last_stock_qty numeric,
  last_pushed_qty integer,
  last_pushed_at timestamptz,
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.amazon_sku_map DROP CONSTRAINT IF EXISTS amazon_sku_map_buffer_check;
ALTER TABLE public.amazon_sku_map
  ADD CONSTRAINT amazon_sku_map_buffer_check CHECK (buffer_qty IS NULL OR (buffer_qty >= 0 AND buffer_qty <= 1000));

CREATE UNIQUE INDEX IF NOT EXISTS amazon_sku_map_org_sku_key
  ON public.amazon_sku_map (organization_id, seller_sku);

CREATE INDEX IF NOT EXISTS idx_amazon_sku_map_org_product
  ON public.amazon_sku_map (organization_id, product_id);

CREATE INDEX IF NOT EXISTS idx_amazon_sku_map_needs_push
  ON public.amazon_sku_map (organization_id)
  WHERE needs_push AND active;

ALTER TABLE public.amazon_sku_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view Amazon SKU map" ON public.amazon_sku_map;
CREATE POLICY "Org members can view Amazon SKU map"
ON public.amazon_sku_map FOR SELECT
USING (public.user_belongs_to_org(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Org admins can add Amazon SKU map" ON public.amazon_sku_map;
CREATE POLICY "Org admins can add Amazon SKU map"
ON public.amazon_sku_map FOR INSERT
WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role));

DROP POLICY IF EXISTS "Org admins can change Amazon SKU map" ON public.amazon_sku_map;
CREATE POLICY "Org admins can change Amazon SKU map"
ON public.amazon_sku_map FOR UPDATE
USING (public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role))
WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role));

DROP POLICY IF EXISTS "Org admins can delete Amazon SKU map" ON public.amazon_sku_map;
CREATE POLICY "Org admins can delete Amazon SKU map"
ON public.amazon_sku_map FOR DELETE
USING (public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role));

-- Stock trigger: marks the mapped SKUs of a changed size for the next push.
-- Never blocks a sale or purchase: any error inside is swallowed.
CREATE OR REPLACE FUNCTION public.amazon_mark_sku_for_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.amazon_channel_settings s
    WHERE s.organization_id = NEW.organization_id AND s.enabled
  ) THEN
    RETURN NEW;
  END IF;

  BEGIN
    UPDATE public.amazon_sku_map m
    SET needs_push = true, stock_changed_at = clock_timestamp()
    WHERE m.organization_id = NEW.organization_id
      AND m.product_id = NEW.product_id
      AND m.size = NEW.size
      AND m.color IS NOT DISTINCT FROM NEW.color
      AND m.active;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.amazon_mark_sku_for_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_amazon_mark_sku_for_push ON public.product_variants;
CREATE TRIGGER trg_amazon_mark_sku_for_push
  AFTER UPDATE OF stock_qty ON public.product_variants
  FOR EACH ROW
  WHEN (OLD.stock_qty IS DISTINCT FROM NEW.stock_qty)
  EXECUTE FUNCTION public.amazon_mark_sku_for_push();

-- Every 2 minutes: call the amazon-sync edge function, only when some switched-on shop
-- has a SKU waiting. Same one-time ticket as the backup and WhatsApp dispatchers.
CREATE OR REPLACE FUNCTION public.dispatch_amazon_sync()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_token text;
  v_request_id bigint;
  v_url text;
  v_anon text;
BEGIN
  IF auth.role() = 'anon' OR auth.role() = 'authenticated' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.amazon_sku_map m
    JOIN public.amazon_channel_settings s ON s.organization_id = m.organization_id
    WHERE m.needs_push AND m.active AND s.enabled AND s.has_keys
  ) THEN
    RETURN NULL;
  END IF;

  v_url := NULLIF(current_setting('app.supabase_url', true), '');
  v_anon := NULLIF(current_setting('app.supabase_anon_key', true), '');
  IF v_url IS NULL THEN
    v_url := 'https://lkbbrqcsbhqjvsxiorvp.supabase.co';
  END IF;
  IF v_anon IS NULL THEN
    v_anon := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrYmJycWNzYmhxanZzeGlvcnZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NTAyMzIsImV4cCI6MjA3ODAyNjIzMn0.DkxBeR40bFS06Ea9TZcQ9KTuSgik5akoiQFv5mye4ts';
  END IF;

  DELETE FROM public.backup_dispatch_tickets
  WHERE expires_at < now() - interval '1 hour';

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.backup_dispatch_tickets (token, expires_at)
  VALUES (v_token, now() + interval '10 minutes')
  RETURNING id INTO v_id;

  SELECT net.http_post(
    url := v_url || '/functions/v1/amazon-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'apikey', v_anon,
      'x-backup-dispatch-ticket', v_id::text || ':' || v_token
    ),
    body := '{"action":"scheduled"}'::jsonb,
    timeout_milliseconds := 120000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dispatch_amazon_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_amazon_sync() TO postgres;

DO $$
BEGIN
  PERFORM cron.unschedule('amazon-sync-every-2-min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'amazon-sync-every-2-min',
  '*/2 * * * *',
  $$ SELECT public.dispatch_amazon_sync(); $$
);
