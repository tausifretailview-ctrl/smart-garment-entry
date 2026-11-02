-- New organizations only: Settings > Purchase "Individual Barcode for Every Piece"
-- (purchase_settings.per_piece_barcode) starts ON.
--
-- Re-defines the BEFORE INSERT trigger function from 20270122120000_new_org_default_settings
-- with one extra purchase_settings key. Same rules as before: only the FIRST settings row of
-- an org created on or after 14 Oct 2026, and only keys the insert did not set itself.
-- Existing organizations keep their current value; the app treats a missing key as OFF.

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
    'show_purchase_code_on_pos', true,
    'per_piece_barcode', true
  ) || COALESCE(NEW.purchase_settings, '{}'::jsonb);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_new_org_default_settings() FROM PUBLIC, anon, authenticated;
