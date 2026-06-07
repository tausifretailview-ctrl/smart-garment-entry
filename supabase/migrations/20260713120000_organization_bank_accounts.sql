-- Organization receiving bank accounts (customer/supplier payment tracking).
-- GL still posts to single 1010 Bank; receiving_bank_account_id is audit/reporting only.

CREATE TABLE IF NOT EXISTS public.organization_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  account_holder text,
  account_number text,
  ifsc_code text,
  branch text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_org_bank_accounts_org_active
  ON public.organization_bank_accounts (organization_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.organization_bank_accounts IS
  'Bank accounts where the organization receives UPI/card/bank payments (per-org, soft-deletable).';

ALTER TABLE public.voucher_entries
  ADD COLUMN IF NOT EXISTS receiving_bank_account_id uuid
  REFERENCES public.organization_bank_accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.voucher_entries.receiving_bank_account_id IS
  'Which org bank account received this electronic payment (tracking only; GL unchanged).';

ALTER TABLE public.organization_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view organization bank accounts" ON public.organization_bank_accounts;
CREATE POLICY "Org members can view organization bank accounts"
  ON public.organization_bank_accounts FOR SELECT
  USING (
    deleted_at IS NULL
    AND organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Admins and managers can insert organization bank accounts" ON public.organization_bank_accounts;
CREATE POLICY "Admins and managers can insert organization bank accounts"
  ON public.organization_bank_accounts FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'manager'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Admins and managers can update organization bank accounts" ON public.organization_bank_accounts;
CREATE POLICY "Admins and managers can update organization bank accounts"
  ON public.organization_bank_accounts FOR UPDATE
  USING (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'manager'::public.app_role)
    )
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'manager'::public.app_role)
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.organization_bank_accounts TO authenticated;
