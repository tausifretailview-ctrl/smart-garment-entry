-- Balance adjustment dialog writes journal_status / journal_entry_id on student_balance_audit.
-- Idempotent: safe if 20260605120000_student_fee_balance_adjustment_gl.sql already ran.

ALTER TABLE public.student_balance_audit
  ADD COLUMN IF NOT EXISTS journal_status text,
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.student_balance_audit.journal_status IS
  'GL lifecycle: pending, posted, skipped (engine off), error.';
COMMENT ON COLUMN public.student_balance_audit.journal_entry_id IS
  'Posted journal_entries.id when accounting engine recorded this adjustment.';
