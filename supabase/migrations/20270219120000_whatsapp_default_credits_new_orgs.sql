-- Every new organization starts with 50 Ezzy ERP WhatsApp messages, valid 1 year.
-- Platform admin adds more once the shop orders (platform_add_whatsapp_credits).
CREATE OR REPLACE FUNCTION public.organizations_default_whatsapp_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_valid DATE := ((now() AT TIME ZONE 'Asia/Kolkata')::date + INTERVAL '1 year')::date;
BEGIN
  INSERT INTO whatsapp_message_credits (organization_id, balance, valid_until, last_topup_at)
  VALUES (NEW.id, 50, v_valid, now())
  ON CONFLICT (organization_id) DO NOTHING;

  IF FOUND THEN
    INSERT INTO whatsapp_credit_topups (
      organization_id, messages, valid_until, balance_before, balance_after, note
    ) VALUES (NEW.id, 50, v_valid, 0, 50, 'Default free balance (new organization)');
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block creating a shop over its WhatsApp balance.
  RAISE WARNING 'default WhatsApp credits failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.organizations_default_whatsapp_credits() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_organizations_default_whatsapp_credits ON public.organizations;
CREATE TRIGGER trg_organizations_default_whatsapp_credits
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_default_whatsapp_credits();
