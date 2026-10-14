-- New organizations only: start with these defaults.
--   Sale settings: Invoice Preview Dialog OFF, Ask Price When Last Purchase Differs OFF,
--   Size Grid in Sales Invoice OFF, POS margin indicator for owner ON.
--   Purchase settings: Default Tax Rate 0%, Show Purchase Code on POS product rows ON.
--   WhatsApp: send provider WappConnect, bill text with the PDF as 1 message ON.
--
-- Works through BEFORE INSERT triggers on public.settings and public.whatsapp_api_settings,
-- so it covers every org creation path (create_organization, platform_create_organization,
-- seed_organization_whatsapp_settings, or the first save from the Settings pages) without
-- rewriting those functions.
--
-- Existing organizations are untouched: the triggers act only on the FIRST row for an org
-- created on or after 14 Oct 2026, and only fill keys the insert did not set. The app's
-- fallbacks for a missing key stay as they were, so old orgs keep today's behaviour.

CREATE OR REPLACE FUNCTION public.apply_new_org_default_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = NEW.organization_id
      AND o.created_at >= timestamptz '2026-10-14 00:00:00+05:30'
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.settings s WHERE s.organization_id = NEW.organization_id) THEN
    RETURN NEW;
  END IF;

  NEW.sale_settings := jsonb_build_object(
    'show_invoice_preview', false,
    'ask_price_on_scan', false,
    'enable_size_grid_sales', false,
    'pos_margin_indicator_for_owner', true
  ) || COALESCE(NEW.sale_settings, '{}'::jsonb);

  NEW.purchase_settings := jsonb_build_object(
    'default_tax_rate', 0,
    'show_purchase_code_on_pos', true
  ) || COALESCE(NEW.purchase_settings, '{}'::jsonb);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_org_default_settings ON public.settings;
CREATE TRIGGER trg_new_org_default_settings
  BEFORE INSERT ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.apply_new_org_default_settings();

CREATE OR REPLACE FUNCTION public.apply_new_org_default_whatsapp_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = NEW.organization_id
      AND o.created_at >= timestamptz '2026-10-14 00:00:00+05:30'
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.whatsapp_api_settings w WHERE w.organization_id = NEW.organization_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.send_provider IS NULL OR NEW.send_provider = 'existing' THEN
    NEW.send_provider := 'wappconnect';
  END IF;
  NEW.wappconnect_single_message := true;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_org_default_whatsapp_settings ON public.whatsapp_api_settings;
CREATE TRIGGER trg_new_org_default_whatsapp_settings
  BEFORE INSERT ON public.whatsapp_api_settings
  FOR EACH ROW EXECUTE FUNCTION public.apply_new_org_default_whatsapp_settings();

REVOKE ALL ON FUNCTION public.apply_new_org_default_settings() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_new_org_default_whatsapp_settings() FROM PUBLIC, anon, authenticated;
