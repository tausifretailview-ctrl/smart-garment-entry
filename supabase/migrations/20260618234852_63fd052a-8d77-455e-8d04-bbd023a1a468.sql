CREATE OR REPLACE FUNCTION public.is_entry_creator_or_admin(
  _organization_id uuid,
  _created_by uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      _created_by IS NULL
      OR _created_by = auth.uid()
      OR public.has_org_role(auth.uid(), _organization_id, 'admin'::app_role)
    );
$$;

DROP POLICY IF EXISTS "Service role can insert batch stock" ON public.batch_stock;
DROP POLICY IF EXISTS "Service role can update batch stock" ON public.batch_stock;
DROP POLICY IF EXISTS "Service role can delete batch stock" ON public.batch_stock;

CREATE POLICY "Service role can insert batch stock"
  ON public.batch_stock FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update batch stock"
  ON public.batch_stock FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can delete batch stock"
  ON public.batch_stock FOR DELETE
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "Service role can insert stock movements" ON public.stock_movements;

CREATE POLICY "Service role can insert stock movements"
  ON public.stock_movements FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert sequences" ON public.bill_number_sequence;
DROP POLICY IF EXISTS "Service role can update sequences" ON public.bill_number_sequence;

CREATE POLICY "Service role can insert sequences"
  ON public.bill_number_sequence FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update sequences"
  ON public.bill_number_sequence FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admins_and_platform_admins_can_view_all_roles" ON public.user_roles;

CREATE POLICY "platform_admins_can_view_all_roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'platform_admin'::app_role));

DROP POLICY IF EXISTS "users_can_view_own_roles" ON public.user_roles;
CREATE POLICY "users_can_view_own_roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

ALTER FUNCTION public._is_cn_refund_payment_voucher(text, text, text, text, text) SET search_path = public;
ALTER FUNCTION public._voucher_financial_year_label(date) SET search_path = public;