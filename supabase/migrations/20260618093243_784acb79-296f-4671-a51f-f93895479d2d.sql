
-- 1) Drop temporary diagnostic snapshot table (no RLS, contained tenant data)
DROP TABLE IF EXISTS public.ella_noor_cn_repair_20260606_snapshot;

-- 2) Replace `auth.uid() IS NULL` service-role policies with explicit service_role targeting.
--    These policies were intended for backend/service use, but `auth.uid() IS NULL` also
--    matches anonymous JWT-less requests. Restrict to service_role only.

DROP POLICY IF EXISTS "Service role can delete batch stock" ON public.batch_stock;
DROP POLICY IF EXISTS "Service role can insert batch stock" ON public.batch_stock;
DROP POLICY IF EXISTS "Service role can update batch stock" ON public.batch_stock;

CREATE POLICY "Service role can manage batch stock"
ON public.batch_stock
AS PERMISSIVE
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert sequences" ON public.bill_number_sequence;
DROP POLICY IF EXISTS "Service role can update sequences" ON public.bill_number_sequence;

CREATE POLICY "Service role can manage bill sequences"
ON public.bill_number_sequence
AS PERMISSIVE
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
