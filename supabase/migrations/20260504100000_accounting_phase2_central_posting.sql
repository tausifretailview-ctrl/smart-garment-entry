-- Phase 2 (Total Accounting): one journal per business reference (idempotent posting).
-- Application uses postJournalEntry(); this index makes races safe (23505 → treat as already posted).

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_org_ref_unique
  ON public.journal_entries (organization_id, reference_type, reference_id)
  WHERE reference_id IS NOT NULL;
