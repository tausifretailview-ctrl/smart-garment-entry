
-- 1. Restrict SELECT on portal_otp / portal_otp_expires_at to service_role only.
-- Revoke table-level SELECT, then grant SELECT on every non-OTP column.
REVOKE SELECT ON public.customers FROM authenticated;
REVOKE SELECT ON public.customers FROM anon;

GRANT SELECT (
  id, customer_name, phone, email, address, gst_number, created_at, updated_at,
  organization_id, opening_balance, deleted_at, deleted_by, discount_percent,
  total_points_earned, points_balance, points_redeemed, transport_details,
  portal_enabled, portal_price_type, portal_last_login
) ON public.customers TO authenticated;

-- Also restrict UPDATE of OTP columns to service_role only.
REVOKE UPDATE ON public.customers FROM authenticated;
REVOKE UPDATE ON public.customers FROM anon;
GRANT UPDATE (
  id, customer_name, phone, email, address, gst_number, created_at, updated_at,
  organization_id, opening_balance, deleted_at, deleted_by, discount_percent,
  total_points_earned, points_balance, points_redeemed, transport_details,
  portal_enabled, portal_price_type, portal_last_login
) ON public.customers TO authenticated;

-- 2. Fix platform_settings policies to use has_role(user_roles) instead of organization_members.role.
DROP POLICY IF EXISTS "Platform admins can modify platform settings" ON public.platform_settings;
DROP POLICY IF EXISTS "Platform admins can view platform settings" ON public.platform_settings;

CREATE POLICY "Platform admins can view platform settings"
ON public.platform_settings
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY "Platform admins can modify platform settings"
ON public.platform_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'platform_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::app_role));

-- 3. Add explicit service_role policy on portal_sessions so intent is clear.
DROP POLICY IF EXISTS "Service role only" ON public.portal_sessions;

CREATE POLICY "Block all client access to portal_sessions"
ON public.portal_sessions
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Service role full access to portal_sessions"
ON public.portal_sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
