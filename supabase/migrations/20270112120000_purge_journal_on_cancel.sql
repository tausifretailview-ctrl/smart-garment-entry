-- Cancelled sales invoices and purchase bills kept their Sale / Purchase journal,
-- so revenue, output GST, COGS, stock and AR (or stock, input GST and AP) of a
-- cancelled document stayed in the GL Trial Balance, P&L and Balance Sheet.
-- cancel_invoice / cancel_purchase_bill set is_cancelled but not deleted_at, so
-- the soft-delete purge triggers (20260516120000) never fired. Purge on cancel
-- the same way. Journals already left by past cancellations are cleaned up
-- separately (reviewed per org), not by this migration.

CREATE OR REPLACE FUNCTION public.purge_journal_on_sale_cancel()
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

DROP TRIGGER IF EXISTS trg_sales_cancel_purge_journal ON public.sales;
CREATE TRIGGER trg_sales_cancel_purge_journal
  AFTER UPDATE OF is_cancelled ON public.sales
  FOR EACH ROW
  WHEN (COALESCE(OLD.is_cancelled, false) = false AND NEW.is_cancelled = true)
  EXECUTE FUNCTION public.purge_journal_on_sale_cancel();

CREATE OR REPLACE FUNCTION public.purge_journal_on_purchase_bill_cancel()
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

DROP TRIGGER IF EXISTS trg_purchase_bills_cancel_purge_journal ON public.purchase_bills;
CREATE TRIGGER trg_purchase_bills_cancel_purge_journal
  AFTER UPDATE OF is_cancelled ON public.purchase_bills
  FOR EACH ROW
  WHEN (COALESCE(OLD.is_cancelled, false) = false AND NEW.is_cancelled = true)
  EXECUTE FUNCTION public.purge_journal_on_purchase_bill_cancel();
