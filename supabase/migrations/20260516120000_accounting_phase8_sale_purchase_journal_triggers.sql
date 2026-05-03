-- Phase 8: Purge Sale / Purchase chart journals when sales or purchase bills are soft-deleted or permanently deleted.

CREATE OR REPLACE FUNCTION public.purge_journal_on_sale_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.journal_entries
  WHERE organization_id = NEW.organization_id
    AND reference_type = 'Sale'
    AND reference_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_soft_delete_purge_journal ON public.sales;
CREATE TRIGGER trg_sales_soft_delete_purge_journal
  AFTER UPDATE ON public.sales
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION public.purge_journal_on_sale_soft_delete();

CREATE OR REPLACE FUNCTION public.purge_journal_on_sale_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.journal_entries
  WHERE organization_id = OLD.organization_id
    AND reference_type = 'Sale'
    AND reference_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_delete_purge_journal ON public.sales;
CREATE TRIGGER trg_sales_delete_purge_journal
  BEFORE DELETE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.purge_journal_on_sale_hard_delete();

CREATE OR REPLACE FUNCTION public.purge_journal_on_purchase_bill_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.journal_entries
  WHERE organization_id = NEW.organization_id
    AND reference_type = 'Purchase'
    AND reference_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_bills_soft_delete_purge_journal ON public.purchase_bills;
CREATE TRIGGER trg_purchase_bills_soft_delete_purge_journal
  AFTER UPDATE ON public.purchase_bills
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION public.purge_journal_on_purchase_bill_soft_delete();

CREATE OR REPLACE FUNCTION public.purge_journal_on_purchase_bill_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.journal_entries
  WHERE organization_id = OLD.organization_id
    AND reference_type = 'Purchase'
    AND reference_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_bills_delete_purge_journal ON public.purchase_bills;
CREATE TRIGGER trg_purchase_bills_delete_purge_journal
  BEFORE DELETE ON public.purchase_bills
  FOR EACH ROW
  EXECUTE FUNCTION public.purge_journal_on_purchase_bill_hard_delete();
