
-- 1. Restrict portal OTP columns on customers table to service_role only
REVOKE SELECT (portal_otp, portal_otp_expires_at) ON public.customers FROM authenticated;
REVOKE SELECT (portal_otp, portal_otp_expires_at) ON public.customers FROM anon;

-- 2. Replace inline admin checks on ledger_opening_balances with has_org_role()
DROP POLICY IF EXISTS "Org admins can update ledger opening balances" ON public.ledger_opening_balances;
DROP POLICY IF EXISTS "Org admins can delete ledger opening balances" ON public.ledger_opening_balances;

CREATE POLICY "Org admins can update ledger opening balances"
ON public.ledger_opening_balances
FOR UPDATE
USING (
  organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  AND (
    has_role(auth.uid(), 'platform_admin'::app_role)
    OR has_org_role(auth.uid(), organization_id, 'admin'::app_role)
  )
);

CREATE POLICY "Org admins can delete ledger opening balances"
ON public.ledger_opening_balances
FOR DELETE
USING (
  organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  AND (
    has_role(auth.uid(), 'platform_admin'::app_role)
    OR has_org_role(auth.uid(), organization_id, 'admin'::app_role)
  )
);
