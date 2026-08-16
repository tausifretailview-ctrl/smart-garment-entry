-- balance_reconciliation_log: drop blanket anon/authenticated SELECT-true restrictive policy
DROP POLICY IF EXISTS "Allow select for restrictive layer" ON public.balance_reconciliation_log;
DROP POLICY IF EXISTS "Block writes from authenticated users" ON public.balance_reconciliation_log;

CREATE POLICY "Block inserts from app roles" ON public.balance_reconciliation_log
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "Block updates from app roles" ON public.balance_reconciliation_log
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Block deletes from app roles" ON public.balance_reconciliation_log
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- keep org-scoped read, but restrict to authenticated only
DROP POLICY IF EXISTS "org_members_recon_log_select" ON public.balance_reconciliation_log;
CREATE POLICY "org_members_recon_log_select" ON public.balance_reconciliation_log
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids((SELECT auth.uid()))));

REVOKE ALL ON public.balance_reconciliation_log FROM anon;
GRANT SELECT ON public.balance_reconciliation_log TO authenticated;
GRANT ALL ON public.balance_reconciliation_log TO service_role;

-- barcode_sequence
DROP POLICY IF EXISTS "Allow select for restrictive layer" ON public.barcode_sequence;
DROP POLICY IF EXISTS "Block writes from authenticated users" ON public.barcode_sequence;

CREATE POLICY "Block inserts from app roles" ON public.barcode_sequence
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "Block updates from app roles" ON public.barcode_sequence
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Block deletes from app roles" ON public.barcode_sequence
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

REVOKE ALL ON public.barcode_sequence FROM anon;
GRANT SELECT ON public.barcode_sequence TO authenticated;
GRANT ALL ON public.barcode_sequence TO service_role;

-- Security definer view -> invoker
ALTER VIEW public.v_accounting_invariants SET (security_invoker = on);