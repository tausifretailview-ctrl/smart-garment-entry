
-- 1. Restrict portal_otp columns on customers to service_role only
REVOKE SELECT (portal_otp, portal_otp_expires_at) ON public.customers FROM authenticated, anon;
-- service_role bypasses RLS and column grants, but ensure it has access
GRANT SELECT (portal_otp, portal_otp_expires_at), UPDATE (portal_otp, portal_otp_expires_at) ON public.customers TO service_role;

-- 2. balance_reconciliation_log: block writes from authenticated
DROP POLICY IF EXISTS "Block writes from authenticated users" ON public.balance_reconciliation_log;
CREATE POLICY "Block writes from authenticated users"
ON public.balance_reconciliation_log
AS RESTRICTIVE
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

-- Re-allow SELECT via the existing permissive policy by adding a restrictive SELECT that allows all (so the restrictive policy above doesn't block reads)
DROP POLICY IF EXISTS "Allow select for restrictive layer" ON public.balance_reconciliation_log;
CREATE POLICY "Allow select for restrictive layer"
ON public.balance_reconciliation_log
AS RESTRICTIVE
FOR SELECT
TO authenticated, anon
USING (true);

-- 3. barcode_sequence: same pattern
DROP POLICY IF EXISTS "Block writes from authenticated users" ON public.barcode_sequence;
CREATE POLICY "Block writes from authenticated users"
ON public.barcode_sequence
AS RESTRICTIVE
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Allow select for restrictive layer" ON public.barcode_sequence;
CREATE POLICY "Allow select for restrictive layer"
ON public.barcode_sequence
AS RESTRICTIVE
FOR SELECT
TO authenticated, anon
USING (true);
