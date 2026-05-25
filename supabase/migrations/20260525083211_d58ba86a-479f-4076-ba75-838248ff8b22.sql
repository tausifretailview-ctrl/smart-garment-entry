-- Fix mutable search_path on internal helper function
ALTER FUNCTION public._customer_cn_pool_row_available(numeric, numeric, uuid, numeric, numeric) SET search_path = public;

-- Restrict access to sensitive portal OTP columns on customers.
-- These values are only used server-side by the portal-auth edge function (service_role),
-- and must never be readable by authenticated org members.
REVOKE SELECT (portal_otp, portal_otp_expires_at) ON public.customers FROM anon, authenticated;