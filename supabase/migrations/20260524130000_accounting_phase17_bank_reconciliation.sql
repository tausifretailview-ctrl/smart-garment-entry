-- Phase 17: Bank reconciliation fields on journal_lines.

ALTER TABLE public.journal_lines
  ADD COLUMN IF NOT EXISTS is_reconciled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciliation_date timestamptz,
  ADD COLUMN IF NOT EXISTS bank_statement_reference text;

COMMENT ON COLUMN public.journal_lines.is_reconciled IS 'True when this line is cleared/reconciled with the bank statement.';
COMMENT ON COLUMN public.journal_lines.reconciliation_date IS 'When the line was marked reconciled (server time).';
COMMENT ON COLUMN public.journal_lines.bank_statement_reference IS 'Optional bank statement id, fit id, or reference text.';

CREATE INDEX IF NOT EXISTS idx_journal_lines_is_reconciled
  ON public.journal_lines (is_reconciled);

CREATE INDEX IF NOT EXISTS idx_journal_lines_unreconciled
  ON public.journal_lines (journal_entry_id)
  WHERE is_reconciled = false;
