CREATE TABLE IF NOT EXISTS public._kz_excel_stage (
  barcode text PRIMARY KEY,
  product_name text NOT NULL,
  brand text,
  style text,
  size text,
  color text,
  pur_price numeric,
  sale_price numeric
);
GRANT ALL ON public._kz_excel_stage TO service_role;

CREATE OR REPLACE FUNCTION public.kz_reconcile_excel_import(p_org uuid)
RETURNS TABLE(variants_updated int, variants_inserted int, products_created int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int := 0;
  v_inserted int := 0;
  v_products int := 0;
BEGIN
  -- 1) Create any missing products (product_name + brand + style + color combo)
  WITH distinct_products AS (
    SELECT DISTINCT product_name, brand, style, color FROM _kz_excel_stage
  ),
  existing_products AS (
    SELECT DISTINCT ON (pn,br,st,co) id, pn, br, st, co FROM (
      SELECT id,
             UPPER(COALESCE(product_name,'')) AS pn,
             UPPER(COALESCE(brand,'')) AS br,
             UPPER(COALESCE(style,'')) AS st,
             UPPER(COALESCE(color,'')) AS co
      FROM products
      WHERE organization_id = p_org AND deleted_at IS NULL
    ) x
    ORDER BY pn,br,st,co,id
  ),
  ins AS (
    INSERT INTO products (organization_id, product_name, brand, style, color, status, default_pur_price, default_sale_price)
    SELECT p_org,
           dp.product_name,
           NULLIF(dp.brand,''), NULLIF(dp.style,''), NULLIF(dp.color,''),
           'active', 0, 0
    FROM distinct_products dp
    LEFT JOIN existing_products ep
      ON ep.pn = UPPER(COALESCE(dp.product_name,''))
     AND ep.br = UPPER(COALESCE(dp.brand,''))
     AND ep.st = UPPER(COALESCE(dp.style,''))
     AND ep.co = UPPER(COALESCE(dp.color,''))
    WHERE ep.id IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_products FROM ins;

  -- 2) UPDATE existing variants -> relink to correct product + fix size/color/prices
  WITH existing_products AS (
    SELECT DISTINCT ON (pn,br,st,co) id, pn, br, st, co FROM (
      SELECT id,
             UPPER(COALESCE(product_name,'')) AS pn,
             UPPER(COALESCE(brand,'')) AS br,
             UPPER(COALESCE(style,'')) AS st,
             UPPER(COALESCE(color,'')) AS co
      FROM products
      WHERE organization_id = p_org AND deleted_at IS NULL
    ) x
    ORDER BY pn,br,st,co,id
  ),
  upd AS (
    UPDATE product_variants pv
    SET product_id = ep.id,
        size       = NULLIF(s.size,''),
        color      = NULLIF(s.color,''),
        pur_price  = s.pur_price,
        sale_price = s.sale_price,
        updated_at = now()
    FROM _kz_excel_stage s
    JOIN existing_products ep
      ON ep.pn = UPPER(COALESCE(s.product_name,''))
     AND ep.br = UPPER(COALESCE(s.brand,''))
     AND ep.st = UPPER(COALESCE(s.style,''))
     AND ep.co = UPPER(COALESCE(s.color,''))
    WHERE pv.organization_id = p_org
      AND pv.deleted_at IS NULL
      AND pv.barcode = s.barcode
    RETURNING pv.id
  )
  SELECT count(*) INTO v_updated FROM upd;

  -- 3) INSERT missing barcodes as new variants
  WITH existing_products AS (
    SELECT DISTINCT ON (pn,br,st,co) id, pn, br, st, co FROM (
      SELECT id,
             UPPER(COALESCE(product_name,'')) AS pn,
             UPPER(COALESCE(brand,'')) AS br,
             UPPER(COALESCE(style,'')) AS st,
             UPPER(COALESCE(color,'')) AS co
      FROM products
      WHERE organization_id = p_org AND deleted_at IS NULL
    ) x
    ORDER BY pn,br,st,co,id
  ),
  ins AS (
    INSERT INTO product_variants (organization_id, product_id, barcode, size, color, pur_price, sale_price, stock_qty, active)
    SELECT p_org, ep.id, s.barcode, NULLIF(s.size,''), NULLIF(s.color,''), s.pur_price, s.sale_price, 0, true
    FROM _kz_excel_stage s
    JOIN existing_products ep
      ON ep.pn = UPPER(COALESCE(s.product_name,''))
     AND ep.br = UPPER(COALESCE(s.brand,''))
     AND ep.st = UPPER(COALESCE(s.style,''))
     AND ep.co = UPPER(COALESCE(s.color,''))
    WHERE NOT EXISTS (
      SELECT 1 FROM product_variants pv2
      WHERE pv2.organization_id = p_org
        AND pv2.barcode = s.barcode
        AND pv2.deleted_at IS NULL
    )
    RETURNING id
  )
  SELECT count(*) INTO v_inserted FROM ins;

  RETURN QUERY SELECT v_updated, v_inserted, v_products;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kz_reconcile_excel_import(uuid) TO service_role;