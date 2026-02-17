
-- Step 1: Index for per-variant time queries
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant_time 
ON stock_movements(variant_id, created_at);

-- Step 2: Single variant point-in-time function
CREATE OR REPLACE FUNCTION public.get_stock_at_time(
  p_variant_id UUID,
  p_timestamp TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (
    COALESCE(pv.opening_qty, 0) +
    COALESCE((
      SELECT SUM(sm.quantity)::integer
      FROM stock_movements sm
      WHERE sm.variant_id = p_variant_id
        AND sm.created_at <= p_timestamp
        AND sm.movement_type <> 'reconciliation'
    ), 0)
  )
  FROM product_variants pv
  WHERE pv.id = p_variant_id;
$$;

-- Step 3: Batch variant point-in-time function
CREATE OR REPLACE FUNCTION public.get_stock_at_time_batch(
  p_variant_ids UUID[],
  p_timestamp TIMESTAMPTZ
)
RETURNS TABLE(variant_id UUID, stock_at_time INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    pv.id AS variant_id,
    (
      COALESCE(pv.opening_qty, 0) +
      COALESCE((
        SELECT SUM(sm.quantity)::integer
        FROM stock_movements sm
        WHERE sm.variant_id = pv.id
          AND sm.created_at <= p_timestamp
          AND sm.movement_type <> 'reconciliation'
      ), 0)
    ) AS stock_at_time
  FROM product_variants pv
  WHERE pv.id = ANY(p_variant_ids);
$$;
