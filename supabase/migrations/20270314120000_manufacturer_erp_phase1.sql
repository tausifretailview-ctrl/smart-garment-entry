-- Manufacturer ERP, phase 1: process stages, design cards (fabric/trims per piece + stage rates)
-- and a metre ledger for fabric rolls. Nothing here touches existing purchase, sale or stock
-- tables; the screens only show when Platform Admin turns on the "manufacturer_erp" feature
-- for a shop and the shop switches it on in Settings > Product.
--
-- Fabric metres left on a roll = roll length (variant size, roll-wise MTR entry) x rolls in stock,
-- or stock_qty for MTR products kept as plain metres, minus net metres issued to production
-- (mfg_fabric_ledger). Phase 2 writes ledger rows when fabric is issued to a lot.

-- 1. Stages (Cutting, Polishing, Colouring, ...) per shop, editable and reorderable.
CREATE TABLE IF NOT EXISTS public.mfg_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  sequence integer NOT NULL DEFAULT 0,
  work_type text NOT NULL DEFAULT 'both' CHECK (work_type IN ('in_house', 'job_work', 'both')),
  default_rate numeric(12,2) NOT NULL DEFAULT 0 CHECK (default_rate >= 0),
  allowed_days integer CHECK (allowed_days IS NULL OR allowed_days >= 0),
  allowed_wastage_percent numeric(6,2) CHECK (allowed_wastage_percent IS NULL OR allowed_wastage_percent BETWEEN 0 AND 100),
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mfg_stages_name_uq
  ON public.mfg_stages (organization_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS mfg_stages_org_seq_idx
  ON public.mfg_stages (organization_id, sequence);

-- 2. Design card: one finished product, what one piece uses, and what each stage pays.
CREATE TABLE IF NOT EXISTS public.mfg_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  design_no text NOT NULL CHECK (char_length(btrim(design_no)) BETWEEN 1 AND 40),
  design_name text,
  finished_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  overhead_per_piece numeric(12,2) NOT NULL DEFAULT 0 CHECK (overhead_per_piece >= 0),
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mfg_designs_no_uq
  ON public.mfg_designs (organization_id, lower(btrim(design_no)));

CREATE TABLE IF NOT EXISTS public.mfg_design_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  design_id uuid NOT NULL REFERENCES public.mfg_designs(id) ON DELETE CASCADE,
  material_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  material_type text NOT NULL DEFAULT 'fabric' CHECK (material_type IN ('fabric', 'trim')),
  qty_per_piece numeric(12,3) NOT NULL CHECK (qty_per_piece > 0),
  wastage_percent numeric(6,2) NOT NULL DEFAULT 0 CHECK (wastage_percent BETWEEN 0 AND 100),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mfg_design_materials_design_idx
  ON public.mfg_design_materials (design_id);

CREATE TABLE IF NOT EXISTS public.mfg_design_stage_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  design_id uuid NOT NULL REFERENCES public.mfg_designs(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.mfg_stages(id) ON DELETE CASCADE,
  rate numeric(12,2) NOT NULL DEFAULT 0 CHECK (rate >= 0),
  UNIQUE (design_id, stage_id)
);

-- 3. Fabric metre ledger: every metre that leaves or comes back to a roll for production.
CREATE TABLE IF NOT EXISTS public.mfg_fabric_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  entry_type text NOT NULL CHECK (entry_type IN ('issue', 'return', 'wastage')),
  -- Always positive; issue/wastage take metres off the roll, return adds them back.
  meters numeric(12,3) NOT NULL CHECK (meters > 0),
  signed_meters numeric(12,3) GENERATED ALWAYS AS (
    CASE WHEN entry_type = 'return' THEN meters ELSE -meters END
  ) STORED,
  lot_id uuid,
  reason text,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mfg_fabric_ledger_variant_idx
  ON public.mfg_fabric_ledger (organization_id, variant_id);

-- updated_at + org lock on edits
CREATE OR REPLACE FUNCTION public.mfg_touch_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.organization_id := OLD.organization_id;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mfg_stages_touch ON public.mfg_stages;
CREATE TRIGGER mfg_stages_touch BEFORE INSERT OR UPDATE ON public.mfg_stages
  FOR EACH ROW EXECUTE FUNCTION public.mfg_touch_row();
DROP TRIGGER IF EXISTS mfg_designs_touch ON public.mfg_designs;
CREATE TRIGGER mfg_designs_touch BEFORE INSERT OR UPDATE ON public.mfg_designs
  FOR EACH ROW EXECUTE FUNCTION public.mfg_touch_row();

-- 4. Row level security: shop members read and write their own shop's rows; only admins delete
--    stages and designs. Ledger rows are never edited or deleted (corrections are new rows).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mfg_stages', 'mfg_designs', 'mfg_design_materials', 'mfg_design_stage_rates', 'mfg_fabric_ledger']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
         EXISTS (SELECT 1 FROM public.organization_members om
                 WHERE om.organization_id = %I.organization_id AND om.user_id = auth.uid()))',
      t || '_select', t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (
         EXISTS (SELECT 1 FROM public.organization_members om
                 WHERE om.organization_id = %I.organization_id AND om.user_id = auth.uid()))',
      t || '_insert', t, t);

    IF t <> 'mfg_fabric_ledger' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
           USING (EXISTS (SELECT 1 FROM public.organization_members om
                          WHERE om.organization_id = %I.organization_id AND om.user_id = auth.uid()))
           WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om
                          WHERE om.organization_id = %I.organization_id AND om.user_id = auth.uid()))',
        t || '_update', t, t, t);
    END IF;
  END LOOP;
END;
$$;

-- Child rows of a design card are replaced on save, so members may delete those;
-- stages and designs themselves need an admin.
DROP POLICY IF EXISTS mfg_design_materials_delete ON public.mfg_design_materials;
CREATE POLICY mfg_design_materials_delete ON public.mfg_design_materials
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.organization_members om
                 WHERE om.organization_id = mfg_design_materials.organization_id AND om.user_id = auth.uid()));

DROP POLICY IF EXISTS mfg_design_stage_rates_delete ON public.mfg_design_stage_rates;
CREATE POLICY mfg_design_stage_rates_delete ON public.mfg_design_stage_rates
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.organization_members om
                 WHERE om.organization_id = mfg_design_stage_rates.organization_id AND om.user_id = auth.uid()));

DROP POLICY IF EXISTS mfg_stages_delete ON public.mfg_stages;
CREATE POLICY mfg_stages_delete ON public.mfg_stages
  FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role));

DROP POLICY IF EXISTS mfg_designs_delete ON public.mfg_designs;
CREATE POLICY mfg_designs_delete ON public.mfg_designs
  FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role));

-- 5. Fabric stock in metres, one row per roll / MTR variant that still has metres.
--    SECURITY INVOKER: RLS on products / variants / ledger keeps it to the caller's shop.
CREATE OR REPLACE FUNCTION public.get_mfg_fabric_stock(p_organization_id uuid)
RETURNS TABLE (
  variant_id uuid,
  product_id uuid,
  product_name text,
  color text,
  barcode text,
  is_roll boolean,
  roll_meters numeric,
  rolls_in_stock numeric,
  meters_purchased_in_stock numeric,
  meters_used numeric,
  meters_left numeric,
  pur_price numeric,
  stock_value numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH v AS (
    SELECT
      pv.id AS variant_id,
      p.id AS product_id,
      p.product_name,
      pv.color,
      pv.barcode,
      (btrim(pv.size) ~ '^[0-9]+(\.[0-9]+)?$') AS is_roll,
      CASE WHEN btrim(pv.size) ~ '^[0-9]+(\.[0-9]+)?$' THEN btrim(pv.size)::numeric END AS roll_meters,
      GREATEST(COALESCE(pv.stock_qty, 0), 0) AS stock_qty,
      COALESCE(NULLIF(pv.pur_price, 0), p.default_pur_price, 0) AS pur_price
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.organization_id = p_organization_id
      AND p.organization_id = p_organization_id
      AND upper(COALESCE(p.uom, '')) = 'MTR'
      AND pv.deleted_at IS NULL
      AND p.deleted_at IS NULL
  ),
  used AS (
    SELECT l.variant_id, -SUM(l.signed_meters) AS meters_used
    FROM public.mfg_fabric_ledger l
    WHERE l.organization_id = p_organization_id
    GROUP BY l.variant_id
  )
  SELECT
    v.variant_id,
    v.product_id,
    v.product_name,
    v.color,
    v.barcode,
    v.is_roll,
    v.roll_meters,
    CASE WHEN v.is_roll THEN v.stock_qty END AS rolls_in_stock,
    CASE WHEN v.is_roll THEN v.roll_meters * v.stock_qty ELSE v.stock_qty END AS meters_purchased_in_stock,
    COALESCE(u.meters_used, 0) AS meters_used,
    GREATEST(
      (CASE WHEN v.is_roll THEN v.roll_meters * v.stock_qty ELSE v.stock_qty END) - COALESCE(u.meters_used, 0),
      0
    ) AS meters_left,
    v.pur_price,
    ROUND(
      GREATEST(
        (CASE WHEN v.is_roll THEN v.roll_meters * v.stock_qty ELSE v.stock_qty END) - COALESCE(u.meters_used, 0),
        0
      ) * v.pur_price,
      2
    ) AS stock_value
  FROM v
  LEFT JOIN used u ON u.variant_id = v.variant_id
  WHERE v.stock_qty > 0 OR COALESCE(u.meters_used, 0) <> 0
  ORDER BY v.product_name, v.color NULLS FIRST, v.roll_meters NULLS FIRST;
$$;

GRANT EXECUTE ON FUNCTION public.get_mfg_fabric_stock(uuid) TO authenticated;
