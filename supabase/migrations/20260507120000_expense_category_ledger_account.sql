-- Map expense_categories to chart_of_accounts for GL posting (Phase 4b).

ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS ledger_account_id UUID NULL
  REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expense_categories_ledger_account
  ON public.expense_categories (ledger_account_id)
  WHERE ledger_account_id IS NOT NULL;
