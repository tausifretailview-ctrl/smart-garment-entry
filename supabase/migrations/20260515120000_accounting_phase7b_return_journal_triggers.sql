-- Phase 7b: Purge SaleReturn / PurchaseReturn chart journals when returns are soft-deleted or permanently deleted (any code path).

CREATE OR REPLACE FUNCTION public.purge_journal_on_sale_return_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.journal_entries
  WHERE organization_id = NEW.organization_id
    AND reference_type = 'SaleReturn'
    AND reference_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_returns_soft_delete_purge_journal ON public.sale_returns;
CREATE TRIGGER trg_sale_returns_soft_delete_purge_journal
  AFTER UPDATE ON public.sale_returns
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION public.purge_journal_on_sale_return_soft_delete();

CREATE OR REPLACE FUNCTION public.purge_journal_on_sale_return_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.journal_entries
  WHERE organization_id = OLD.organization_id
    AND reference_type = 'SaleReturn'
    AND reference_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_returns_delete_purge_journal ON public.sale_returns;
CREATE TRIGGER trg_sale_returns_delete_purge_journal
  BEFORE DELETE ON public.sale_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.purge_journal_on_sale_return_hard_delete();

CREATE OR REPLACE FUNCTION public.purge_journal_on_purchase_return_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.journal_entries
  WHERE organization_id = NEW.organization_id
    AND reference_type = 'PurchaseReturn'
    AND reference_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_returns_soft_delete_purge_journal ON public.purchase_returns;
CREATE TRIGGER trg_purchase_returns_soft_delete_purge_journal
  AFTER UPDATE ON public.purchase_returns
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION public.purge_journal_on_purchase_return_soft_delete();

CREATE OR REPLACE FUNCTION public.purge_journal_on_purchase_return_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.journal_entries
  WHERE organization_id = OLD.organization_id
    AND reference_type = 'PurchaseReturn'
    AND reference_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_returns_delete_purge_journal ON public.purchase_returns;
CREATE TRIGGER trg_purchase_returns_delete_purge_journal
  BEFORE DELETE ON public.purchase_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.purge_journal_on_purchase_return_hard_delete();
