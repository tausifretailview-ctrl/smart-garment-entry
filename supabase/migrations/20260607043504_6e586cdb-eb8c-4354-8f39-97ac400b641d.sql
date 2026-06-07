-- Create organization_bank_accounts table for receiving-bank tracking on customer payments
CREATE TABLE IF NOT EXISTS public.organization_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_holder TEXT,
  account_number TEXT,
  ifsc_code TEXT,
  branch TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_org_bank_accounts_org
  ON public.organization_bank_accounts(organization_id) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_bank_accounts TO authenticated;
GRANT ALL ON public.organization_bank_accounts TO service_role;

ALTER TABLE public.organization_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view bank accounts" ON public.organization_bank_accounts;
CREATE POLICY "Org members can view bank accounts"
  ON public.organization_bank_accounts FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Admins and managers can manage bank accounts" ON public.organization_bank_accounts;
CREATE POLICY "Admins and managers can manage bank accounts"
  ON public.organization_bank_accounts FOR ALL
  TO authenticated
  USING (
    user_belongs_to_org(auth.uid(), organization_id)
    AND (has_org_role(auth.uid(), organization_id, 'admin'::app_role)
         OR has_org_role(auth.uid(), organization_id, 'manager'::app_role))
  )
  WITH CHECK (
    user_belongs_to_org(auth.uid(), organization_id)
    AND (has_org_role(auth.uid(), organization_id, 'admin'::app_role)
         OR has_org_role(auth.uid(), organization_id, 'manager'::app_role))
  );

-- Track which org bank account received the payment recorded in a voucher
ALTER TABLE public.voucher_entries
  ADD COLUMN IF NOT EXISTS receiving_bank_account_id UUID REFERENCES public.organization_bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_voucher_entries_receiving_bank
  ON public.voucher_entries(receiving_bank_account_id) WHERE receiving_bank_account_id IS NOT NULL;