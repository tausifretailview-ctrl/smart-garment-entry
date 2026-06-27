-- Denormalize purchase line-item row count on purchase_bills.
-- Replaces PostgREST purchase_items(count) LATERAL embed on the dashboard list.
-- Count semantics: active lines only (deleted_at IS NULL), matching fetchPurchaseItemsByBillId.

ALTER TABLE public.purchase_bills
  ADD COLUMN IF NOT EXISTS total_items integer NOT NULL DEFAULT 0;

UPDATE public.purchase_bills pb
SET total_items = COALESCE(
  (
    SELECT COUNT(*)::integer
    FROM public.purchase_items pi
    WHERE pi.bill_id = pb.id
      AND pi.deleted_at IS NULL
  ),
  0
);

CREATE OR REPLACE FUNCTION public.update_purchase_bill_total_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  target_bill_id uuid;
BEGIN
  IF COALESCE(current_setting('app.bulk_purchase_insert', true), '') = '1' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    target_bill_id := OLD.bill_id;
  ELSE
    target_bill_id := NEW.bill_id;
  END IF;

  UPDATE public.purchase_bills
  SET total_items = (
    SELECT COUNT(*)::integer
    FROM public.purchase_items pi
    WHERE pi.bill_id = target_bill_id
      AND pi.deleted_at IS NULL
  )
  WHERE id = target_bill_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_purchase_bill_total_items ON public.purchase_items;

CREATE TRIGGER trg_update_purchase_bill_total_items
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_items
FOR EACH ROW
EXECUTE FUNCTION public.update_purchase_bill_total_items();

-- Bulk save skips row triggers; refresh total_items alongside total_qty.
CREATE OR REPLACE FUNCTION public._apply_bulk_purchase_insert_effects(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_purchase_date timestamptz;
  v_bill_number text;
  v_org_id uuid;
  v_missing_variants integer;
BEGIN
  SELECT bill_date, software_bill_no, organization_id
  INTO v_purchase_date, v_bill_number, v_org_id
  FROM public.purchase_bills
  WHERE id = p_bill_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Purchase bill % not found for bulk insert effects', p_bill_id;
  END IF;

  UPDATE public.purchase_bills
  SET
    total_qty = (
      SELECT COALESCE(SUM(pi.qty), 0)::integer
      FROM public.purchase_items pi
      WHERE pi.bill_id = p_bill_id
        AND pi.deleted_at IS NULL
    ),
    total_items = (
      SELECT COUNT(*)::integer
      FROM public.purchase_items pi
      WHERE pi.bill_id = p_bill_id
        AND pi.deleted_at IS NULL
    )
  WHERE id = p_bill_id;

  WITH agg AS (
    SELECT pi.sku_id, SUM(pi.qty) AS qty
    FROM public.purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
    GROUP BY pi.sku_id
  )
  SELECT COUNT(*)::integer
  INTO v_missing_variants
  FROM agg
  WHERE NOT EXISTS (
    SELECT 1 FROM public.product_variants pv WHERE pv.id = agg.sku_id
  );

  IF v_missing_variants > 0 THEN
    RAISE EXCEPTION 'Cannot add purchase stock: % variant(s) not found', v_missing_variants;
  END IF;

  WITH agg AS (
    SELECT pi.sku_id, SUM(pi.qty) AS qty
    FROM public.purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
    GROUP BY pi.sku_id
  )
  UPDATE public.product_variants pv
  SET stock_qty = pv.stock_qty + agg.qty::integer,
      updated_at = NOW()
  FROM agg
  WHERE pv.id = agg.sku_id;

  WITH agg AS (
    SELECT pi.sku_id, SUM(pi.qty) AS qty
    FROM public.purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
    GROUP BY pi.sku_id
  )
  INSERT INTO public.batch_stock (
    variant_id,
    bill_number,
    quantity,
    purchase_bill_id,
    purchase_date,
    organization_id
  )
  SELECT
    agg.sku_id,
    v_bill_number,
    agg.qty::integer,
    p_bill_id,
    v_purchase_date,
    v_org_id
  FROM agg
  ON CONFLICT (variant_id, bill_number)
  DO UPDATE SET
    quantity = public.batch_stock.quantity + EXCLUDED.quantity,
    updated_at = NOW();

  INSERT INTO public.stock_movements (
    variant_id,
    movement_type,
    quantity,
    reference_id,
    bill_number,
    notes,
    organization_id,
    user_id
  )
  SELECT
    pi.sku_id,
    'purchase',
    pi.qty,
    p_bill_id,
    v_bill_number,
    'Stock added from purchase bill ' || v_bill_number,
    v_org_id,
    auth.uid()
  FROM public.purchase_items pi
  WHERE pi.bill_id = p_bill_id
    AND pi.deleted_at IS NULL
    AND pi.sku_id IS NOT NULL;

  UPDATE public.product_variants pv
  SET
    last_purchase_pur_price = latest.pur_price,
    last_purchase_sale_price = latest.sale_price,
    last_purchase_mrp = latest.mrp,
    last_purchase_date = NOW(),
    updated_at = NOW()
  FROM (
    SELECT DISTINCT ON (pi.sku_id)
      pi.sku_id,
      pi.pur_price,
      pi.sale_price,
      pi.mrp
    FROM public.purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
    ORDER BY pi.sku_id, pi.ctid DESC
  ) AS latest
  WHERE pv.id = latest.sku_id;
END;
$function$;

COMMENT ON COLUMN public.purchase_bills.total_items IS
  'Count of active purchase_items rows (deleted_at IS NULL). Maintained by trg_update_purchase_bill_total_items.';
