-- SQL file 53: new organizations start with the optional menus hidden.
--
-- Settings → Users → Optional menus (organizations.settings.optional_menus) hides screens most
-- shops never use: Transport / Employee / Commission / Salesman Location, Stock Settlement /
-- Adjustment, Duplicate Purchase Bills / Customer Balance Reconciliation, the extra customer
-- reports, and Website. Existing organizations have no key and keep every menu. Every
-- organization created from now on (create_organization, platform_create_organization or any
-- other insert) gets every group set to false unless the insert already sets optional_menus;
-- the shop turns on what it needs. Running this again changes nothing.

CREATE OR REPLACE FUNCTION public.new_org_optional_menus_off()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF COALESCE(NEW.settings, '{}'::jsonb) ? 'optional_menus' THEN
    RETURN NEW;
  END IF;
  NEW.settings := COALESCE(NEW.settings, '{}'::jsonb) || jsonb_build_object(
    'optional_menus', jsonb_build_object(
      'masters', false,
      'stock_tools', false,
      'data_checks', false,
      'customer_reports', false,
      'website', false
    )
  );
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.new_org_optional_menus_off() IS
  'BEFORE INSERT on organizations: a new organization starts with every optional menu group off '
  '(organizations.settings.optional_menus); Settings → Users → Optional menus turns them on.';

DROP TRIGGER IF EXISTS trg_new_org_optional_menus_off ON public.organizations;
CREATE TRIGGER trg_new_org_optional_menus_off
  BEFORE INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.new_org_optional_menus_off();
