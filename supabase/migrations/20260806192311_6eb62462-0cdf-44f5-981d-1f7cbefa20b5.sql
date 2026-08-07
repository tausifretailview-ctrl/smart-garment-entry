ALTER VIEW public.v_accounting_invariants SET (security_invoker = true);

DROP POLICY IF EXISTS "Users can delete advances for their organization" ON public.customer_advances;
CREATE POLICY "Admins and managers can delete advances"
ON public.customer_advances FOR DELETE TO authenticated
USING (
  organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid())
  AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'manager'))
);

DROP POLICY IF EXISTS "Users can delete purchase orders in their organization" ON public.purchase_orders;
CREATE POLICY "Admins and managers can delete purchase orders"
ON public.purchase_orders FOR DELETE TO authenticated
USING (
  organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid())
  AND (public.has_org_role(auth.uid(), organization_id, 'admin') OR public.has_org_role(auth.uid(), organization_id, 'manager'))
);

DROP POLICY IF EXISTS "Users can delete purchase order items" ON public.purchase_order_items;
CREATE POLICY "Admins and managers can delete purchase order items"
ON public.purchase_order_items FOR DELETE TO authenticated
USING (
  order_id IN (
    SELECT po.id FROM public.purchase_orders po
    WHERE po.organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid())
      AND (public.has_org_role(auth.uid(), po.organization_id, 'admin') OR public.has_org_role(auth.uid(), po.organization_id, 'manager'))
  )
);