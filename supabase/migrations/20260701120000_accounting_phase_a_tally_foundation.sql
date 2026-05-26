-- Phase A (Tally v2 foundation): COA groups, new ledgers, party dimensions on journal lines,
-- manual journal reference types, ledger opening balances, books-closed date.
-- Does not change sale/purchase posting logic (Phase B).

-- ---------------------------------------------------------------------------
-- A1: Tally-style primary group on chart_of_accounts
-- ---------------------------------------------------------------------------
ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS account_group text;

ALTER TABLE public.chart_of_accounts
  DROP CONSTRAINT IF EXISTS chart_of_accounts_account_group_check;

ALTER TABLE public.chart_of_accounts
  ADD CONSTRAINT chart_of_accounts_account_group_check
  CHECK (
    account_group IS NULL
    OR account_group IN (
      'Branch / Divisions',
      'Capital Account',
      'Current Assets',
      'Current Liabilities',
      'Direct Expenses',
      'Direct Incomes',
      'Duties & Taxes',
      'Fixed Assets',
      'Indirect Expenses',
      'Indirect Incomes',
      'Investments',
      'Loans (Liability)',
      'Misc. Expenses (ASSET)',
      'Provisions',
      'Purchase Accounts',
      'Reserves & Surplus',
      'Retained Earnings',
      'Sales Accounts',
      'Stock-in-Hand',
      'Sundry Creditors',
      'Sundry Debtors',
      'Suspense Account'
    )
  );

COMMENT ON COLUMN public.chart_of_accounts.account_group IS
  'Tally primary group for grouped trial balance / balance sheet (Phase C UI).';

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_org_group
  ON public.chart_of_accounts (organization_id, account_group)
  WHERE account_group IS NOT NULL;

-- Backfill groups for existing system accounts by code
UPDATE public.chart_of_accounts c
SET account_group = v.grp
FROM (
  VALUES
    ('1000', 'Current Assets'),
    ('1010', 'Current Assets'),
    ('1200', 'Sundry Debtors'),
    ('1300', 'Stock-in-Hand'),
    ('1400', 'Duties & Taxes'),
    ('1410', 'Duties & Taxes'),
    ('1420', 'Duties & Taxes'),
    ('2000', 'Sundry Creditors'),
    ('2150', 'Current Liabilities'),
    ('2200', 'Duties & Taxes'),
    ('2210', 'Duties & Taxes'),
    ('2220', 'Duties & Taxes'),
    ('4000', 'Direct Incomes'),
    ('4010', 'Direct Incomes'),
    ('4050', 'Direct Incomes'),
    ('4060', 'Indirect Expenses'),
    ('4070', 'Direct Incomes'),
    ('4100', 'Direct Incomes'),
    ('5000', 'Direct Expenses'),
    ('5050', 'Direct Expenses'),
    ('6000', 'Indirect Expenses'),
    ('6050', 'Indirect Expenses'),
    ('6100', 'Indirect Expenses'),
    ('6900', 'Indirect Expenses')
) AS v(code, grp)
WHERE c.account_code = v.code
  AND c.is_system_account = true
  AND (c.account_group IS NULL OR c.account_group IS DISTINCT FROM v.grp);

-- ---------------------------------------------------------------------------
-- A2: Seed new Tally v2 system ledgers for every organization (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO public.chart_of_accounts (
  organization_id,
  account_code,
  account_name,
  account_type,
  account_group,
  parent_account_id,
  is_system_account
)
SELECT
  o.id,
  v.account_code,
  v.account_name,
  v.account_type,
  v.account_group,
  NULL,
  true
FROM public.organizations o
CROSS JOIN (
  VALUES
    ('1300', 'Stock-in-Hand', 'Asset', 'Stock-in-Hand'),
    ('1400', 'Input CGST', 'Asset', 'Duties & Taxes'),
    ('1410', 'Input SGST', 'Asset', 'Duties & Taxes'),
    ('1420', 'Input IGST', 'Asset', 'Duties & Taxes'),
    ('2200', 'Output CGST', 'Liability', 'Duties & Taxes'),
    ('2210', 'Output SGST', 'Liability', 'Duties & Taxes'),
    ('2220', 'Output IGST', 'Liability', 'Duties & Taxes'),
    ('4010', 'Trade Discount Given', 'Revenue', 'Direct Incomes'),
    ('6900', 'Round Off', 'Expense', 'Indirect Expenses')
) AS v(account_code, account_name, account_type, account_group)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.chart_of_accounts c
  WHERE c.organization_id = o.id
    AND c.account_code = v.account_code
);

-- ---------------------------------------------------------------------------
-- A3: Party subledger dimensions on journal_lines (Phase C drill-down)
-- ---------------------------------------------------------------------------
ALTER TABLE public.journal_lines
  ADD COLUMN IF NOT EXISTS party_type text,
  ADD COLUMN IF NOT EXISTS party_id uuid,
  ADD COLUMN IF NOT EXISTS party_name_snapshot text;

ALTER TABLE public.journal_lines
  DROP CONSTRAINT IF EXISTS journal_lines_party_type_check;

ALTER TABLE public.journal_lines
  ADD CONSTRAINT journal_lines_party_type_check
  CHECK (party_type IS NULL OR party_type IN ('customer', 'supplier'));

ALTER TABLE public.journal_lines
  DROP CONSTRAINT IF EXISTS journal_lines_party_consistency_check;

ALTER TABLE public.journal_lines
  ADD CONSTRAINT journal_lines_party_consistency_check
  CHECK (
    (party_type IS NULL AND party_id IS NULL)
    OR (party_type IS NOT NULL AND party_id IS NOT NULL)
  );

COMMENT ON COLUMN public.journal_lines.party_type IS 'Sundry debtor/creditor subledger: customer or supplier.';
COMMENT ON COLUMN public.journal_lines.party_id IS 'customers.id or suppliers.id when party_type is set.';
COMMENT ON COLUMN public.journal_lines.party_name_snapshot IS 'Display name at post time for ledger reports.';

CREATE INDEX IF NOT EXISTS idx_journal_lines_account_party
  ON public.journal_lines (account_id, party_type, party_id)
  WHERE party_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- A4: Extend journal reference types for manual vouchers (Phase C UI)
-- ---------------------------------------------------------------------------
ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_reference_type_check;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_reference_type_check
  CHECK (reference_type IN (
    'Sale',
    'Purchase',
    'Payment',
    'StudentFeeReceipt',
    'StudentFeeBalanceAdjustment',
    'ExpenseVoucher',
    'SalaryVoucher',
    'CustomerReceipt',
    'SupplierPayment',
    'CustomerAdvanceApplication',
    'CustomerCreditNoteApplication',
    'CustomerAdvanceReceipt',
    'CustomerAdvanceRefund',
    'SaleReturn',
    'PurchaseReturn',
    'ManualJournal',
    'Contra',
    'RoundOff'
  ));

-- ---------------------------------------------------------------------------
-- A5: Ledger opening balances (balance-sheet opening on first-use date)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ledger_opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE CASCADE,
  as_of_date date NOT NULL,
  debit_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, account_id, as_of_date),
  CHECK (
    (debit_amount > 0 AND credit_amount = 0)
    OR (credit_amount > 0 AND debit_amount = 0)
    OR (debit_amount = 0 AND credit_amount = 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_ledger_opening_balances_org_date
  ON public.ledger_opening_balances (organization_id, as_of_date);

COMMENT ON TABLE public.ledger_opening_balances IS
  'Opening balance per ledger as of a date; included in GL trial balance / BS (Phase C RPCs).';

ALTER TABLE public.ledger_opening_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view ledger opening balances" ON public.ledger_opening_balances;
CREATE POLICY "Org members can view ledger opening balances"
ON public.ledger_opening_balances FOR SELECT
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Org members can insert ledger opening balances" ON public.ledger_opening_balances;
CREATE POLICY "Org members can insert ledger opening balances"
ON public.ledger_opening_balances FOR INSERT
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Org admins can update ledger opening balances" ON public.ledger_opening_balances;
CREATE POLICY "Org admins can update ledger opening balances"
ON public.ledger_opening_balances FOR UPDATE
USING (
  organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'platform_admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = ledger_opening_balances.organization_id
        AND om.role = 'admin'::public.app_role
    )
  )
);

DROP POLICY IF EXISTS "Org admins can delete ledger opening balances" ON public.ledger_opening_balances;
CREATE POLICY "Org admins can delete ledger opening balances"
ON public.ledger_opening_balances FOR DELETE
USING (
  organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  AND (
    public.has_role(auth.uid(), 'platform_admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = ledger_opening_balances.organization_id
        AND om.role = 'admin'::public.app_role
    )
  )
);

-- ---------------------------------------------------------------------------
-- A6: Books closed before date + enforcement trigger
-- ---------------------------------------------------------------------------
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS books_closed_before_date date;

COMMENT ON COLUMN public.settings.books_closed_before_date IS
  'Journals with date strictly before this value are blocked (org/platform admins may override).';

CREATE OR REPLACE FUNCTION public.enforce_journal_not_in_closed_books()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_closed_before date;
BEGIN
  SELECT s.books_closed_before_date
  INTO v_closed_before
  FROM public.settings s
  WHERE s.organization_id = NEW.organization_id;

  IF v_closed_before IS NULL OR NEW.date >= v_closed_before THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'platform_admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = NEW.organization_id
        AND om.role = 'admin'::public.app_role
    )
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Accounting period closed: journal date % is before books closed date %',
    NEW.date, v_closed_before
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_entries_enforce_books_closed ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_enforce_books_closed
  BEFORE INSERT OR UPDATE OF date, organization_id ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_journal_not_in_closed_books();
