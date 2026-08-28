-- ============================================================
-- Per-tenant payment gateway: credentials + money-safe receipts
-- ============================================================

-- 1) Environment toggle for PhonePe (was hardcoded to sandbox in code)
ALTER TABLE public.payment_gateway_settings
  ADD COLUMN IF NOT EXISTS phonepe_environment text NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS razorpay_environment text NOT NULL DEFAULT 'test';

ALTER TABLE public.payment_gateway_settings
  DROP CONSTRAINT IF EXISTS payment_gateway_settings_phonepe_env_chk;
ALTER TABLE public.payment_gateway_settings
  ADD CONSTRAINT payment_gateway_settings_phonepe_env_chk
  CHECK (phonepe_environment IN ('sandbox', 'production'));

ALTER TABLE public.payment_gateway_settings
  DROP CONSTRAINT IF EXISTS payment_gateway_settings_razorpay_env_chk;
ALTER TABLE public.payment_gateway_settings
  ADD CONSTRAINT payment_gateway_settings_razorpay_env_chk
  CHECK (razorpay_environment IN ('test', 'live'));

-- 2) Secret material lives in its own table, unreadable by any client role.
CREATE TABLE IF NOT EXISTS public.payment_gateway_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  razorpay_key_secret text,
  razorpay_webhook_secret text,
  phonepe_salt_key text,
  phonepe_salt_index text NOT NULL DEFAULT '1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- No anon/authenticated grants: this table is reachable only by the backend.
REVOKE ALL ON public.payment_gateway_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.payment_gateway_secrets TO service_role;

ALTER TABLE public.payment_gateway_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only_payment_secrets" ON public.payment_gateway_secrets;
CREATE POLICY "service_role_only_payment_secrets"
  ON public.payment_gateway_secrets
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3) Org admins write secrets through this function; they can never read them back.
CREATE OR REPLACE FUNCTION public.save_payment_gateway_secrets(
  p_org_id uuid,
  p_razorpay_key_secret text DEFAULT NULL,
  p_razorpay_webhook_secret text DEFAULT NULL,
  p_phonepe_salt_key text DEFAULT NULL,
  p_phonepe_salt_index text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated'
         AND NOT public.is_org_admin((SELECT auth.uid()), p_org_id)) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.payment_gateway_secrets AS s (
    organization_id, razorpay_key_secret, razorpay_webhook_secret,
    phonepe_salt_key, phonepe_salt_index
  )
  VALUES (
    p_org_id, p_razorpay_key_secret, p_razorpay_webhook_secret,
    p_phonepe_salt_key, COALESCE(p_phonepe_salt_index, '1')
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    -- NULL means "leave unchanged"; empty string means "clear".
    razorpay_key_secret = CASE
      WHEN p_razorpay_key_secret IS NULL THEN s.razorpay_key_secret
      WHEN p_razorpay_key_secret = '' THEN NULL
      ELSE p_razorpay_key_secret END,
    razorpay_webhook_secret = CASE
      WHEN p_razorpay_webhook_secret IS NULL THEN s.razorpay_webhook_secret
      WHEN p_razorpay_webhook_secret = '' THEN NULL
      ELSE p_razorpay_webhook_secret END,
    phonepe_salt_key = CASE
      WHEN p_phonepe_salt_key IS NULL THEN s.phonepe_salt_key
      WHEN p_phonepe_salt_key = '' THEN NULL
      ELSE p_phonepe_salt_key END,
    phonepe_salt_index = COALESCE(NULLIF(p_phonepe_salt_index, ''), s.phonepe_salt_index),
    updated_at = now();
END;
$$;

-- 4) Presence-only view of what is configured (booleans, never the values).
CREATE OR REPLACE FUNCTION public.get_payment_gateway_secret_status(p_org_id uuid)
RETURNS TABLE(
  has_razorpay_key_secret boolean,
  has_razorpay_webhook_secret boolean,
  has_phonepe_salt_key boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated'
         AND NOT (p_org_id IN (SELECT public.get_user_organization_ids((SELECT auth.uid()))))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(s.razorpay_key_secret, '') <> '',
    COALESCE(s.razorpay_webhook_secret, '') <> '',
    COALESCE(s.phonepe_salt_key, '') <> ''
  FROM public.payment_gateway_secrets s
  WHERE s.organization_id = p_org_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, false;
  END IF;
END;
$$;

-- 5) THE money-safe path. Records an online payment as a real receipt voucher so
--    the existing triggers recompute sales.paid_amount / payment_status and the
--    customer ledger. Never writes paid_amount directly. Idempotent per gateway
--    payment id.
CREATE OR REPLACE FUNCTION public.record_online_payment_receipt(
  p_org_id uuid,
  p_payment_link_id uuid,
  p_gateway_payment_id text,
  p_amount numeric,
  p_payment_method text DEFAULT 'online'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link       public.payment_links%ROWTYPE;
  v_voucher_no text;
  v_voucher_id uuid;
BEGIN
  -- Backend-only: the webhook runs as service_role. Triggers/cron pass too.
  IF auth.role() IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid payment amount: %', p_amount USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_link
  FROM public.payment_links
  WHERE id = p_payment_link_id
    AND organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment link % not found for organization %',
      p_payment_link_id, p_org_id USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency: a redelivered webhook must not create a second receipt.
  IF v_link.status = 'paid' THEN
    RETURN NULL;
  END IF;

  IF v_link.sale_id IS NOT NULL THEN
    -- Guard against a duplicate receipt for the same gateway payment.
    IF EXISTS (
      SELECT 1 FROM public.voucher_entries ve
      WHERE ve.organization_id = p_org_id
        AND ve.voucher_type = 'receipt'
        AND ve.reference_id = v_link.sale_id
        AND ve.deleted_at IS NULL
        AND ve.notes = 'gateway_payment_id:' || p_gateway_payment_id
    ) THEN
      RETURN NULL;
    END IF;

    v_voucher_no := public.generate_voucher_number('receipt', CURRENT_DATE);

    INSERT INTO public.voucher_entries (
      organization_id, voucher_number, voucher_type, voucher_date,
      reference_type, reference_id, description, total_amount,
      payment_method, notes, category
    )
    VALUES (
      p_org_id, v_voucher_no, 'receipt', CURRENT_DATE,
      'sale', v_link.sale_id,
      'Online payment' ||
        COALESCE(' for ' || NULLIF(v_link.invoice_number, ''), '') ||
        ' via ' || COALESCE(v_link.gateway, 'gateway'),
      p_amount,
      COALESCE(p_payment_method, 'online'),
      'gateway_payment_id:' || p_gateway_payment_id,
      'customer_receipt'
    )
    RETURNING id INTO v_voucher_id;
  END IF;

  UPDATE public.payment_links
     SET status = 'paid',
         paid_at = now(),
         gateway_payment_id = p_gateway_payment_id,
         updated_at = now()
   WHERE id = p_payment_link_id
     AND organization_id = p_org_id;

  RETURN v_voucher_id;
END;
$$;

-- The DDL event trigger revokes PUBLIC/anon and grants authenticated+service_role.
-- record_online_payment_receipt must not be reachable by signed-in users.
REVOKE EXECUTE ON FUNCTION public.record_online_payment_receipt(uuid, uuid, text, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_online_payment_receipt(uuid, uuid, text, numeric, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.save_payment_gateway_secrets(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_payment_gateway_secrets(uuid, text, text, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_payment_gateway_secret_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payment_gateway_secret_status(uuid) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_payment_links_gateway_link_id
  ON public.payment_links (organization_id, gateway_link_id)
  WHERE gateway_link_id IS NOT NULL;