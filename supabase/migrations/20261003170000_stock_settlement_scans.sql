-- Persist stock-settlement scan counts for visibility + atomic finalize via settle_stock_session.

CREATE TABLE IF NOT EXISTS public.stock_settlement_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  settlement_session_id uuid NOT NULL,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  barcode text,
  counted_qty numeric NOT NULL DEFAULT 0,
  system_qty numeric NOT NULL DEFAULT 0,
  scanned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  settled boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_settlement_scans_session_variant
  ON public.stock_settlement_scans (settlement_session_id, variant_id);

CREATE INDEX IF NOT EXISTS idx_stock_settlement_scans_org_variant
  ON public.stock_settlement_scans (organization_id, variant_id);

CREATE INDEX IF NOT EXISTS idx_stock_settlement_scans_org_barcode
  ON public.stock_settlement_scans (organization_id, barcode);

CREATE INDEX IF NOT EXISTS idx_stock_settlement_scans_org_session
  ON public.stock_settlement_scans (organization_id, settlement_session_id);

CREATE INDEX IF NOT EXISTS idx_stock_settlement_scans_org_settled
  ON public.stock_settlement_scans (organization_id, settled, scanned_at DESC);

ALTER TABLE public.stock_settlement_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view stock settlement scans" ON public.stock_settlement_scans;
DROP POLICY IF EXISTS "Org members can insert stock settlement scans" ON public.stock_settlement_scans;
DROP POLICY IF EXISTS "Org members can update stock settlement scans" ON public.stock_settlement_scans;

CREATE POLICY "Org members can view stock settlement scans"
ON public.stock_settlement_scans FOR SELECT
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can insert stock settlement scans"
ON public.stock_settlement_scans FOR INSERT
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can update stock settlement scans"
ON public.stock_settlement_scans FOR UPDATE
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

GRANT SELECT, INSERT, UPDATE ON public.stock_settlement_scans TO authenticated;

-- Atomic finalize: write stock_qty + reconciliation movement + mark session settled.
CREATE OR REPLACE FUNCTION public.settle_stock_session(
  p_organization_id uuid,
  p_session_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scan RECORD;
  v_delta numeric;
  v_count integer := 0;
  v_user_id uuid;
  v_note_suffix text;
BEGIN
  PERFORM public.assert_org_member(p_organization_id);
  v_user_id := auth.uid();

  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_settlement_scans
    WHERE organization_id = p_organization_id
      AND settlement_session_id = p_session_id
      AND settled = false
  ) THEN
    RAISE EXCEPTION 'No open settlement session found for this organization';
  END IF;

  v_note_suffix := CASE
    WHEN p_note IS NOT NULL AND btrim(p_note) <> '' THEN ' | ' || btrim(p_note)
    ELSE ''
  END;

  FOR v_scan IN
    SELECT *
    FROM public.stock_settlement_scans
    WHERE organization_id = p_organization_id
      AND settlement_session_id = p_session_id
      AND settled = false
    ORDER BY scanned_at ASC
  LOOP
    v_delta := v_scan.counted_qty - v_scan.system_qty;

    UPDATE public.product_variants
    SET stock_qty = GREATEST(0, ROUND(v_scan.counted_qty)::integer),
        updated_at = now()
    WHERE id = v_scan.variant_id
      AND organization_id = p_organization_id;

    IF v_delta <> 0 THEN
      INSERT INTO public.stock_movements (
        variant_id,
        organization_id,
        movement_type,
        quantity,
        reference_id,
        notes,
        user_id
      ) VALUES (
        v_scan.variant_id,
        p_organization_id,
        'reconciliation',
        v_delta,
        p_session_id,
        'Stock settlement: ' || v_scan.system_qty || ' → ' || v_scan.counted_qty
          || ' (adjustment: ' || v_delta || ')' || v_note_suffix,
        v_user_id
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.stock_settlement_scans
  SET settled = true
  WHERE organization_id = p_organization_id
    AND settlement_session_id = p_session_id
    AND settled = false;

  RETURN jsonb_build_object(
    'settled_count', v_count,
    'session_id', p_session_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_stock_session(uuid, uuid, text) TO authenticated;
