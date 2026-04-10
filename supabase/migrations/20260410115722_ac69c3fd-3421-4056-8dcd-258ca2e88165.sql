
-- Fix the update trigger to handle sku_id changes
CREATE OR REPLACE FUNCTION public.handle_purchase_item_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If variant changed, move stock from old to new variant
  IF OLD.sku_id IS DISTINCT FROM NEW.sku_id THEN
    -- Deduct old qty from old variant
    IF OLD.sku_id IS NOT NULL THEN
      UPDATE product_variants
      SET stock_qty = COALESCE(stock_qty, 0) - COALESCE(OLD.qty, 0),
          updated_at = now()
      WHERE id = OLD.sku_id;
    END IF;
    -- Add new qty to new variant
    IF NEW.sku_id IS NOT NULL THEN
      UPDATE product_variants
      SET stock_qty = COALESCE(stock_qty, 0) + COALESCE(NEW.qty, 0),
          updated_at = now()
      WHERE id = NEW.sku_id;
    END IF;
    RETURN NEW;
  END IF;

  -- Same variant, check qty change
  IF OLD.qty = NEW.qty THEN
    RETURN NEW;
  END IF;

  -- Apply qty difference to the variant
  UPDATE product_variants
  SET stock_qty = COALESCE(stock_qty, 0) + (NEW.qty - OLD.qty),
      updated_at = now()
  WHERE id = NEW.sku_id;

  RETURN NEW;
END;
$$;

-- Recalculate stock for drifted variants by recomputing from transactions
-- This updates stock_qty based on actual purchase_items, sale_items, sale_return_items, purchase_return_items
WITH computed_stock AS (
  SELECT
    pv.id AS variant_id,
    COALESCE(pi_sum.total, 0) - COALESCE(si_sum.total, 0) + COALESCE(sri_sum.total, 0) - COALESCE(pri_sum.total, 0) AS correct_stock
  FROM product_variants pv
  LEFT JOIN (
    SELECT sku_id, SUM(qty) AS total
    FROM purchase_items
    WHERE deleted_at IS NULL
    GROUP BY sku_id
  ) pi_sum ON pi_sum.sku_id = pv.id
  LEFT JOIN (
    SELECT variant_id, SUM(quantity) AS total
    FROM sale_items
    WHERE deleted_at IS NULL
    GROUP BY variant_id
  ) si_sum ON si_sum.variant_id = pv.id
  LEFT JOIN (
    SELECT variant_id, SUM(quantity) AS total
    FROM sale_return_items
    WHERE deleted_at IS NULL
    GROUP BY variant_id
  ) sri_sum ON sri_sum.variant_id = pv.id
  LEFT JOIN (
    SELECT sku_id, SUM(qty) AS total
    FROM purchase_return_items
    WHERE deleted_at IS NULL
    GROUP BY sku_id
  ) pri_sum ON pri_sum.sku_id = pv.id
  WHERE pv.deleted_at IS NULL
    AND pv.stock_qty IS DISTINCT FROM (
      COALESCE(pi_sum.total, 0) - COALESCE(si_sum.total, 0) + COALESCE(sri_sum.total, 0) - COALESCE(pri_sum.total, 0)
    )
)
UPDATE product_variants pv
SET stock_qty = cs.correct_stock,
    updated_at = now()
FROM computed_stock cs
WHERE pv.id = cs.variant_id;
