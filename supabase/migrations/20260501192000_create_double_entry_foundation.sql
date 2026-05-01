-- Foundation for strict double-entry accounting
-- Step 1: Chart of Accounts + Journal tables

CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('Asset', 'Liability', 'Equity', 'Revenue', 'Expense')),
  parent_account_id UUID NULL REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  is_system_account BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, account_code),
  UNIQUE (organization_id, account_name)
);

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_org_type
  ON public.chart_of_accounts (organization_id, account_type);

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reference_type TEXT NOT NULL CHECK (reference_type IN ('Sale', 'Purchase', 'Payment')),
  reference_id UUID NULL,
  description TEXT NULL,
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_date
  ON public.journal_entries (organization_id, date DESC);

CREATE TABLE IF NOT EXISTS public.journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  debit_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (debit_amount > 0 AND credit_amount = 0)
    OR
    (credit_amount > 0 AND debit_amount = 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry
  ON public.journal_lines (journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_journal_lines_account
  ON public.journal_lines (account_id);

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view chart of accounts" ON public.chart_of_accounts;
DROP POLICY IF EXISTS "Org members can insert chart of accounts" ON public.chart_of_accounts;
DROP POLICY IF EXISTS "Org members can update chart of accounts" ON public.chart_of_accounts;
DROP POLICY IF EXISTS "Org members can delete chart of accounts" ON public.chart_of_accounts;

CREATE POLICY "Org members can view chart of accounts"
ON public.chart_of_accounts FOR SELECT
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can insert chart of accounts"
ON public.chart_of_accounts FOR INSERT
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can update chart of accounts"
ON public.chart_of_accounts FOR UPDATE
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can delete chart of accounts"
ON public.chart_of_accounts FOR DELETE
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Org members can view journal entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Org members can insert journal entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Org members can update journal entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Org members can delete journal entries" ON public.journal_entries;

CREATE POLICY "Org members can view journal entries"
ON public.journal_entries FOR SELECT
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can insert journal entries"
ON public.journal_entries FOR INSERT
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can update journal entries"
ON public.journal_entries FOR UPDATE
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can delete journal entries"
ON public.journal_entries FOR DELETE
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Org members can view journal lines" ON public.journal_lines;
DROP POLICY IF EXISTS "Org members can insert journal lines" ON public.journal_lines;
DROP POLICY IF EXISTS "Org members can update journal lines" ON public.journal_lines;
DROP POLICY IF EXISTS "Org members can delete journal lines" ON public.journal_lines;

CREATE POLICY "Org members can view journal lines"
ON public.journal_lines FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.id = journal_lines.journal_entry_id
      AND je.organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  )
);

CREATE POLICY "Org members can insert journal lines"
ON public.journal_lines FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.id = journal_lines.journal_entry_id
      AND je.organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  )
);

CREATE POLICY "Org members can update journal lines"
ON public.journal_lines FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.id = journal_lines.journal_entry_id
      AND je.organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.id = journal_lines.journal_entry_id
      AND je.organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  )
);

CREATE POLICY "Org members can delete journal lines"
ON public.journal_lines FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.id = journal_lines.journal_entry_id
      AND je.organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  )
);

