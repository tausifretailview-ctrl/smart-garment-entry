
-- =====================================================
-- PHASE 1: Fix nullable organization_id columns
-- Safe: only alters where ALL rows have non-null values
-- =====================================================

-- sales (0 nulls - safe)
ALTER TABLE public.sales ALTER COLUMN organization_id SET NOT NULL;

-- purchase_bills (0 nulls - safe)
ALTER TABLE public.purchase_bills ALTER COLUMN organization_id SET NOT NULL;

-- products (0 nulls - safe)
ALTER TABLE public.products ALTER COLUMN organization_id SET NOT NULL;

-- customers (0 nulls - safe)
ALTER TABLE public.customers ALTER COLUMN organization_id SET NOT NULL;

-- employees (0 nulls - safe)
ALTER TABLE public.employees ALTER COLUMN organization_id SET NOT NULL;

-- account_ledgers (0 nulls - safe)
ALTER TABLE public.account_ledgers ALTER COLUMN organization_id SET NOT NULL;

-- voucher_entries (0 nulls - safe)
ALTER TABLE public.voucher_entries ALTER COLUMN organization_id SET NOT NULL;

-- bill_number_sequence (0 nulls - safe)
ALTER TABLE public.bill_number_sequence ALTER COLUMN organization_id SET NOT NULL;

-- barcode_sequence (0 nulls - safe)
ALTER TABLE public.barcode_sequence ALTER COLUMN organization_id SET NOT NULL;

-- SKIPPED: suppliers (1 row with NULL org_id)
-- SKIPPED: settings (1 row with NULL org_id)
-- These will be handled separately after orphan rows are assigned to an org.

-- =====================================================
-- PHASE 2: Harden sale_items RLS policies
-- =====================================================

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can insert sale items" ON public.sale_items;
DROP POLICY IF EXISTS "Authenticated users can view sale items" ON public.sale_items;
DROP POLICY IF EXISTS "Public can view sale items for shared invoices" ON public.sale_items;

-- Create org-scoped policies via join to sales table
CREATE POLICY "Org members can view sale items" ON public.sale_items
  FOR SELECT TO authenticated
  USING (sale_id IN (
    SELECT id FROM public.sales
    WHERE organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  ));

CREATE POLICY "Org members can insert sale items" ON public.sale_items
  FOR INSERT TO authenticated
  WITH CHECK (sale_id IN (
    SELECT id FROM public.sales
    WHERE organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  ));

CREATE POLICY "Org members can update sale items" ON public.sale_items
  FOR UPDATE TO authenticated
  USING (sale_id IN (
    SELECT id FROM public.sales
    WHERE organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  ));

-- Keep public SELECT for invoice sharing (anon role)
CREATE POLICY "Public can view sale items for invoices" ON public.sale_items
  FOR SELECT TO anon
  USING (true);

-- =====================================================
-- PHASE 2b: Harden sale_order_items RLS policies
-- =====================================================

DROP POLICY IF EXISTS "Users can insert sale order items" ON public.sale_order_items;
DROP POLICY IF EXISTS "Admins and managers can update sale order items" ON public.sale_order_items;
DROP POLICY IF EXISTS "Admins can delete sale order items" ON public.sale_order_items;
DROP POLICY IF EXISTS "Users can view sale order items" ON public.sale_order_items;

CREATE POLICY "Org members can view sale order items" ON public.sale_order_items
  FOR SELECT TO authenticated
  USING (order_id IN (
    SELECT id FROM public.sale_orders
    WHERE organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  ));

CREATE POLICY "Org members can insert sale order items" ON public.sale_order_items
  FOR INSERT TO authenticated
  WITH CHECK (order_id IN (
    SELECT id FROM public.sale_orders
    WHERE organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  ));

CREATE POLICY "Org members can update sale order items" ON public.sale_order_items
  FOR UPDATE TO authenticated
  USING (order_id IN (
    SELECT id FROM public.sale_orders
    WHERE organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  ));

CREATE POLICY "Org members can delete sale order items" ON public.sale_order_items
  FOR DELETE TO authenticated
  USING (order_id IN (
    SELECT id FROM public.sale_orders
    WHERE organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  ));

-- =====================================================
-- PHASE 2c: Harden purchase_return_items RLS policies
-- =====================================================

DROP POLICY IF EXISTS "Admins and managers can manage return items" ON public.purchase_return_items;
DROP POLICY IF EXISTS "Users can view return items" ON public.purchase_return_items;

CREATE POLICY "Org members can view purchase return items" ON public.purchase_return_items
  FOR SELECT TO authenticated
  USING (return_id IN (
    SELECT id FROM public.purchase_returns
    WHERE organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  ));

CREATE POLICY "Org members can insert purchase return items" ON public.purchase_return_items
  FOR INSERT TO authenticated
  WITH CHECK (return_id IN (
    SELECT id FROM public.purchase_returns
    WHERE organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  ));

CREATE POLICY "Org members can update purchase return items" ON public.purchase_return_items
  FOR UPDATE TO authenticated
  USING (return_id IN (
    SELECT id FROM public.purchase_returns
    WHERE organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  ));

CREATE POLICY "Org members can delete purchase return items" ON public.purchase_return_items
  FOR DELETE TO authenticated
  USING (return_id IN (
    SELECT id FROM public.purchase_returns
    WHERE organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  ));

-- =====================================================
-- PHASE 2d: Harden purchase_items RLS policies
-- =====================================================

DROP POLICY IF EXISTS "Users can insert purchase items" ON public.purchase_items;
DROP POLICY IF EXISTS "Users can view purchase items" ON public.purchase_items;
DROP POLICY IF EXISTS "Users can update purchase items" ON public.purchase_items;
DROP POLICY IF EXISTS "Users can delete purchase items" ON public.purchase_items;
DROP POLICY IF EXISTS "Authenticated users can insert purchase items" ON public.purchase_items;
DROP POLICY IF EXISTS "Authenticated users can view purchase items" ON public.purchase_items;

CREATE POLICY "Org members can view purchase items" ON public.purchase_items
  FOR SELECT TO authenticated
  USING (bill_id IN (
    SELECT id FROM public.purchase_bills
    WHERE organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  ));

CREATE POLICY "Org members can insert purchase items" ON public.purchase_items
  FOR INSERT TO authenticated
  WITH CHECK (bill_id IN (
    SELECT id FROM public.purchase_bills
    WHERE organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  ));

CREATE POLICY "Org members can update purchase items" ON public.purchase_items
  FOR UPDATE TO authenticated
  USING (bill_id IN (
    SELECT id FROM public.purchase_bills
    WHERE organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  ));

CREATE POLICY "Org members can delete purchase items" ON public.purchase_items
  FOR DELETE TO authenticated
  USING (bill_id IN (
    SELECT id FROM public.purchase_bills
    WHERE organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  ));

-- =====================================================
-- PHASE 2e: Harden quotation_items RLS policies
-- =====================================================

DROP POLICY IF EXISTS "Users can insert quotation items" ON public.quotation_items;
DROP POLICY IF EXISTS "Users can view quotation items" ON public.quotation_items;
DROP POLICY IF EXISTS "Users can update quotation items" ON public.quotation_items;
DROP POLICY IF EXISTS "Users can delete quotation items" ON public.quotation_items;
DROP POLICY IF EXISTS "Authenticated users can insert quotation items" ON public.quotation_items;
DROP POLICY IF EXISTS "Authenticated users can view quotation items" ON public.quotation_items;

CREATE POLICY "Org members can view quotation items" ON public.quotation_items
  FOR SELECT TO authenticated
  USING (quotation_id IN (
    SELECT id FROM public.quotations
    WHERE organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  ));

CREATE POLICY "Org members can insert quotation items" ON public.quotation_items
  FOR INSERT TO authenticated
  WITH CHECK (quotation_id IN (
    SELECT id FROM public.quotations
    WHERE organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  ));

CREATE POLICY "Org members can update quotation items" ON public.quotation_items
  FOR UPDATE TO authenticated
  USING (quotation_id IN (
    SELECT id FROM public.quotations
    WHERE organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  ));

CREATE POLICY "Org members can delete quotation items" ON public.quotation_items
  FOR DELETE TO authenticated
  USING (quotation_id IN (
    SELECT id FROM public.quotations
    WHERE organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  ));

-- =====================================================
-- PHASE 4: Add missing policy for login_attempts
-- =====================================================

DROP POLICY IF EXISTS "Authenticated users can manage login attempts" ON public.login_attempts;

CREATE POLICY "Authenticated users can manage login attempts" ON public.login_attempts
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
