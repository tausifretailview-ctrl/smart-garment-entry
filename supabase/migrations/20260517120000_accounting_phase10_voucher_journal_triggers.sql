-- Phase 10: Remove chart journals tied to a voucher when voucher_entries is soft-deleted or deleted.
-- reference_id for these types is voucher_entries.id (not customer_advances.id, etc.).

CREATE OR REPLACE FUNCTION public.purge_journals_for_voucher_ref(p_org uuid, p_voucher_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.journal_entries
  WHERE organization_id = p_org
    AND reference_id = p_voucher_id
    AND reference_type IN (
      'CustomerReceipt',
      'SupplierPayment',
      'ExpenseVoucher',
      'SalaryVoucher',
      'StudentFeeReceipt',
      'CustomerCreditNoteApplication',
      'CustomerAdvanceApplication',
      'Payment'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_journal_on_voucher_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.purge_journals_for_voucher_ref(NEW.organization_id, NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voucher_entries_soft_delete_purge_journal ON public.voucher_entries;
CREATE TRIGGER trg_voucher_entries_soft_delete_purge_journal
  AFTER UPDATE ON public.voucher_entries
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION public.purge_journal_on_voucher_soft_delete();

CREATE OR REPLACE FUNCTION public.purge_journal_on_voucher_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.purge_journals_for_voucher_ref(OLD.organization_id, OLD.id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_voucher_entries_delete_purge_journal ON public.voucher_entries;
CREATE TRIGGER trg_voucher_entries_delete_purge_journal
  BEFORE DELETE ON public.voucher_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.purge_journal_on_voucher_hard_delete();
