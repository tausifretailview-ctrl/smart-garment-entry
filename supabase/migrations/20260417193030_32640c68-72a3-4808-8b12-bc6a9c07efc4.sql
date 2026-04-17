-- FIX 1: sale_number_sequence — replace USING(true) with org scoping
DROP POLICY IF EXISTS "Users can manage sale sequences for their org" ON public.sale_number_sequence;
DROP POLICY IF EXISTS "org_sale_number_sequence_all" ON public.sale_number_sequence;
CREATE POLICY "org_sale_number_sequence_all"
ON public.sale_number_sequence
FOR ALL
TO authenticated
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- FIX 2: login_attempts — remove anon SELECT/UPDATE (anon INSERT preserved by existing policy)
-- No org/email column exists, so no authenticated SELECT policy is added.
-- Service role bypasses RLS and can still read for security investigations.
DROP POLICY IF EXISTS "Anon can read login attempts" ON public.login_attempts;
DROP POLICY IF EXISTS "Anon can update login attempts" ON public.login_attempts;

-- FIX 3: barcode_sequence — replace any-authenticated SELECT with org-scoped
DROP POLICY IF EXISTS "Authenticated users can view barcode sequence" ON public.barcode_sequence;
DROP POLICY IF EXISTS "org_barcode_sequence_select" ON public.barcode_sequence;
CREATE POLICY "org_barcode_sequence_select"
ON public.barcode_sequence
FOR SELECT
TO authenticated
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- FIX 4: drop redundant broad SELECT on bill_number_sequence (org-scoped policies already exist)
DROP POLICY IF EXISTS "Authenticated users can view bill sequence" ON public.bill_number_sequence;