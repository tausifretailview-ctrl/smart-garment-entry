
CREATE POLICY "Org members can update adjustments"
ON public.customer_balance_adjustments
FOR UPDATE
USING (public.user_belongs_to_org(auth.uid(), organization_id))
WITH CHECK (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Org members can delete adjustments"
ON public.customer_balance_adjustments
FOR DELETE
USING (public.user_belongs_to_org(auth.uid(), organization_id));
