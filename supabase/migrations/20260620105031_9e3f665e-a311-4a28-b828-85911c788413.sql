-- Restore table-level SELECT/UPDATE grants on public.customers.
-- The prior column-level grants broke any `.select()` / `.select('*')` calls
-- (including INSERT ... RETURNING *) because PostgREST requests every column
-- and Postgres denies access to the unlisted portal_otp / portal_otp_expires_at
-- columns. RLS on customers already scopes rows to the caller's organization,
-- so OTP fields are not exposed cross-tenant.

GRANT SELECT ON public.customers TO authenticated;
GRANT UPDATE ON public.customers TO authenticated;