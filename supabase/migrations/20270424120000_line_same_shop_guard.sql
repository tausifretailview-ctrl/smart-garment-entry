-- Plan Phase 3, C3: a bill line can only point at its own shop's products, sizes and accounts.
--
-- Live check (12 Nov 2026): every busy table has RLS on and every policy keeps a user to
-- their own shop's rows. But the line tables only check the bill they belong to (or, for
-- sale_items, their own organization_id), not the product / size they point at. The stock
-- triggers then change THAT size's stock, so a signed-in user of shop A who knows an id of
-- shop B (ids can leak, e.g. from a public website catalogue) could move shop B's stock.
-- journal_lines had the same gap for the account the line posts to.
--
-- These BEFORE triggers refuse a line whose header, product, size or account belongs to a
-- different shop than its bill / return / journal entry:
--   sale_items            sale_id -> sales; organization_id, variant_id, product_id
--   sale_return_items     return_id -> sale_returns; variant_id, product_id
--   purchase_items        bill_id -> purchase_bills; sku_id, product_id
--   purchase_return_items return_id -> purchase_returns; sku_id, product_id
--   journal_lines         journal_entry_id -> journal_entries; account_id (chart_of_accounts)
-- They fire on INSERT and only when those columns change on UPDATE, so other updates of old
-- lines are untouched. An unknown or empty shop on either side never blocks (only a clear
-- mismatch does). SECURITY DEFINER for the lookups only; nothing is written.
-- UNDO: DROP TRIGGER trg_<table>_same_shop ON public.<table>; DROP FUNCTION the five functions.

CREATE OR REPLACE FUNCTION public._raise_if_other_shop(p_expected uuid, p_actual uuid, p_what text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_expected IS NOT NULL AND p_actual IS NOT NULL AND p_expected <> p_actual THEN
    RAISE EXCEPTION 'This % belongs to another shop and cannot be used on this bill.', p_what
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sale_items_same_shop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.sales WHERE id = NEW.sale_id;
  PERFORM public._raise_if_other_shop(v_org, NEW.organization_id, 'line');
  v_org := coalesce(v_org, NEW.organization_id);
  IF NEW.variant_id IS NOT NULL THEN
    PERFORM public._raise_if_other_shop(v_org, (SELECT organization_id FROM public.product_variants WHERE id = NEW.variant_id), 'product size');
  END IF;
  IF NEW.product_id IS NOT NULL THEN
    PERFORM public._raise_if_other_shop(v_org, (SELECT organization_id FROM public.products WHERE id = NEW.product_id), 'product');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sale_return_items_same_shop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.sale_returns WHERE id = NEW.return_id;
  IF NEW.variant_id IS NOT NULL THEN
    PERFORM public._raise_if_other_shop(v_org, (SELECT organization_id FROM public.product_variants WHERE id = NEW.variant_id), 'product size');
  END IF;
  IF NEW.product_id IS NOT NULL THEN
    PERFORM public._raise_if_other_shop(v_org, (SELECT organization_id FROM public.products WHERE id = NEW.product_id), 'product');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_purchase_items_same_shop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.purchase_bills WHERE id = NEW.bill_id;
  IF NEW.sku_id IS NOT NULL THEN
    PERFORM public._raise_if_other_shop(v_org, (SELECT organization_id FROM public.product_variants WHERE id = NEW.sku_id), 'product size');
  END IF;
  IF NEW.product_id IS NOT NULL THEN
    PERFORM public._raise_if_other_shop(v_org, (SELECT organization_id FROM public.products WHERE id = NEW.product_id), 'product');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_purchase_return_items_same_shop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.purchase_returns WHERE id = NEW.return_id;
  IF NEW.sku_id IS NOT NULL THEN
    PERFORM public._raise_if_other_shop(v_org, (SELECT organization_id FROM public.product_variants WHERE id = NEW.sku_id), 'product size');
  END IF;
  IF NEW.product_id IS NOT NULL THEN
    PERFORM public._raise_if_other_shop(v_org, (SELECT organization_id FROM public.products WHERE id = NEW.product_id), 'product');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_journal_lines_same_shop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.journal_entries WHERE id = NEW.journal_entry_id;
  IF NEW.account_id IS NOT NULL THEN
    PERFORM public._raise_if_other_shop(v_org, (SELECT organization_id FROM public.chart_of_accounts WHERE id = NEW.account_id), 'account');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._raise_if_other_shop(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trg_sale_items_same_shop() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trg_sale_return_items_same_shop() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trg_purchase_items_same_shop() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trg_purchase_return_items_same_shop() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trg_journal_lines_same_shop() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._raise_if_other_shop(uuid, uuid, text) TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_sale_items_same_shop ON public.sale_items;
CREATE TRIGGER trg_sale_items_same_shop
  BEFORE INSERT OR UPDATE OF sale_id, organization_id, variant_id, product_id ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_sale_items_same_shop();

DROP TRIGGER IF EXISTS trg_sale_return_items_same_shop ON public.sale_return_items;
CREATE TRIGGER trg_sale_return_items_same_shop
  BEFORE INSERT OR UPDATE OF return_id, variant_id, product_id ON public.sale_return_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_sale_return_items_same_shop();

DROP TRIGGER IF EXISTS trg_purchase_items_same_shop ON public.purchase_items;
CREATE TRIGGER trg_purchase_items_same_shop
  BEFORE INSERT OR UPDATE OF bill_id, sku_id, product_id ON public.purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_purchase_items_same_shop();

DROP TRIGGER IF EXISTS trg_purchase_return_items_same_shop ON public.purchase_return_items;
CREATE TRIGGER trg_purchase_return_items_same_shop
  BEFORE INSERT OR UPDATE OF return_id, sku_id, product_id ON public.purchase_return_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_purchase_return_items_same_shop();

DROP TRIGGER IF EXISTS trg_journal_lines_same_shop ON public.journal_lines;
CREATE TRIGGER trg_journal_lines_same_shop
  BEFORE INSERT OR UPDATE OF journal_entry_id, account_id ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_journal_lines_same_shop();
