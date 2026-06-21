-- Ella Noor (org 3fdca631-1e0c-4417-9704-421f5129ff67): reverse 64 stale Sale journal entries
-- whose underlying sale is either soft-deleted or cancelled. journal_lines cascade-delete with the entry.
DELETE FROM public.journal_entries je
WHERE je.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
  AND je.reference_type = 'Sale'
  AND je.reference_id IN (
    SELECT s.id FROM public.sales s
    WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
      AND (s.deleted_at IS NOT NULL OR COALESCE(s.is_cancelled, false) = true)
  );