
-- 1) Restrict portal OTP columns to service_role only
REVOKE SELECT (portal_otp, portal_otp_expires_at) ON public.customers FROM authenticated;
REVOKE SELECT (portal_otp, portal_otp_expires_at) ON public.customers FROM anon;
REVOKE UPDATE (portal_otp, portal_otp_expires_at) ON public.customers FROM authenticated;
REVOKE UPDATE (portal_otp, portal_otp_expires_at) ON public.customers FROM anon;
REVOKE INSERT (portal_otp, portal_otp_expires_at) ON public.customers FROM authenticated;
REVOKE INSERT (portal_otp, portal_otp_expires_at) ON public.customers FROM anon;

-- 2) Drop the overly permissive user_roles SELECT policy that allowed any global 'admin' to read all roles.
-- The remaining policies 'users_can_view_own_roles' and 'platform_admins_can_view_all_roles' provide correct access.
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
