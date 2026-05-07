
-- 1) Enable RLS on accounting tables and add org-scoped policies
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

-- chart_of_accounts
DROP POLICY IF EXISTS "Org members can view chart_of_accounts" ON public.chart_of_accounts;
CREATE POLICY "Org members can view chart_of_accounts" ON public.chart_of_accounts
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_org(auth.uid(), organization_id));
DROP POLICY IF EXISTS "Org members can insert chart_of_accounts" ON public.chart_of_accounts;
CREATE POLICY "Org members can insert chart_of_accounts" ON public.chart_of_accounts
  FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_org(auth.uid(), organization_id));
DROP POLICY IF EXISTS "Org members can update chart_of_accounts" ON public.chart_of_accounts;
CREATE POLICY "Org members can update chart_of_accounts" ON public.chart_of_accounts
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_org(auth.uid(), organization_id))
  WITH CHECK (public.user_belongs_to_org(auth.uid(), organization_id));
DROP POLICY IF EXISTS "Org admins can delete chart_of_accounts" ON public.chart_of_accounts;
CREATE POLICY "Org admins can delete chart_of_accounts" ON public.chart_of_accounts
  FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

-- invoice_adjustments
DROP POLICY IF EXISTS "Org members can view invoice_adjustments" ON public.invoice_adjustments;
CREATE POLICY "Org members can view invoice_adjustments" ON public.invoice_adjustments
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_org(auth.uid(), organization_id));
DROP POLICY IF EXISTS "Org members can insert invoice_adjustments" ON public.invoice_adjustments;
CREATE POLICY "Org members can insert invoice_adjustments" ON public.invoice_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_org(auth.uid(), organization_id));
DROP POLICY IF EXISTS "Org admins can update invoice_adjustments" ON public.invoice_adjustments;
CREATE POLICY "Org admins can update invoice_adjustments" ON public.invoice_adjustments
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));
DROP POLICY IF EXISTS "Org admins can delete invoice_adjustments" ON public.invoice_adjustments;
CREATE POLICY "Org admins can delete invoice_adjustments" ON public.invoice_adjustments
  FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

-- journal_entries
DROP POLICY IF EXISTS "Org members can view journal_entries" ON public.journal_entries;
CREATE POLICY "Org members can view journal_entries" ON public.journal_entries
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_org(auth.uid(), organization_id));
DROP POLICY IF EXISTS "Org members can insert journal_entries" ON public.journal_entries;
CREATE POLICY "Org members can insert journal_entries" ON public.journal_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_org(auth.uid(), organization_id));
DROP POLICY IF EXISTS "Org admins can update journal_entries" ON public.journal_entries;
CREATE POLICY "Org admins can update journal_entries" ON public.journal_entries
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));
DROP POLICY IF EXISTS "Org admins can delete journal_entries" ON public.journal_entries;
CREATE POLICY "Org admins can delete journal_entries" ON public.journal_entries
  FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

-- journal_lines (no organization_id; scope via parent journal_entries)
DROP POLICY IF EXISTS "Org members can view journal_lines" ON public.journal_lines;
CREATE POLICY "Org members can view journal_lines" ON public.journal_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.journal_entries je
    WHERE je.id = journal_lines.journal_entry_id
      AND public.user_belongs_to_org(auth.uid(), je.organization_id)
  ));
DROP POLICY IF EXISTS "Org members can insert journal_lines" ON public.journal_lines;
CREATE POLICY "Org members can insert journal_lines" ON public.journal_lines
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.journal_entries je
    WHERE je.id = journal_lines.journal_entry_id
      AND public.user_belongs_to_org(auth.uid(), je.organization_id)
  ));
DROP POLICY IF EXISTS "Org admins can update journal_lines" ON public.journal_lines;
CREATE POLICY "Org admins can update journal_lines" ON public.journal_lines
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.journal_entries je
    WHERE je.id = journal_lines.journal_entry_id
      AND public.is_org_admin(auth.uid(), je.organization_id)
  ));
DROP POLICY IF EXISTS "Org admins can delete journal_lines" ON public.journal_lines;
CREATE POLICY "Org admins can delete journal_lines" ON public.journal_lines
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.journal_entries je
    WHERE je.id = journal_lines.journal_entry_id
      AND public.is_org_admin(auth.uid(), je.organization_id)
  ));

-- 2) Make views run with security_invoker so RLS of querying user applies
ALTER VIEW public.v_student_ledger SET (security_invoker = true);
ALTER VIEW public.v_dashboard_sales_summary SET (security_invoker = true);
ALTER VIEW public.v_dashboard_gross_profit SET (security_invoker = true);
ALTER VIEW public.v_dashboard_purchase_summary SET (security_invoker = true);
ALTER VIEW public.v_dashboard_receivables SET (security_invoker = true);

-- 3) Set fixed search_path on functions flagged by linter
ALTER FUNCTION public.adjust_invoice_balance(uuid, uuid, text, uuid, numeric, uuid, text) SET search_path = public;
ALTER FUNCTION public.adjust_student_fee_balance(uuid, uuid, uuid, numeric, numeric, text, text, uuid) SET search_path = public;
ALTER FUNCTION public.get_customer_ledger_statement(uuid, uuid, date, date) SET search_path = public;
