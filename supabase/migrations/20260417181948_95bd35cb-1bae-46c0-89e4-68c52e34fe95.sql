-- Stock alerts: persistent log of detected stock drift
CREATE TABLE IF NOT EXISTS public.stock_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  product_name text,
  barcode text,
  size text,
  current_stock_qty numeric NOT NULL,
  calculated_stock_qty numeric NOT NULL,
  discrepancy numeric NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_notes text
);

CREATE INDEX IF NOT EXISTS idx_stock_alerts_org_detected
  ON public.stock_alerts (organization_id, detected_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stock_alerts_variant
  ON public.stock_alerts (variant_id)
  WHERE resolved_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_stock_alerts_variant_open
  ON public.stock_alerts (variant_id)
  WHERE resolved_at IS NULL;

ALTER TABLE public.stock_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view stock alerts for their organizations"
ON public.stock_alerts FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Service role manages stock alerts"
ON public.stock_alerts FOR ALL
TO service_role
USING (true) WITH CHECK (true);

-- Detection function: scan one org
CREATE OR REPLACE FUNCTION public.scan_stock_alerts_for_org(p_organization_id uuid)
RETURNS TABLE(new_alerts integer, updated_alerts integer, resolved_alerts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new integer := 0;
  v_updated integer := 0;
  v_resolved integer := 0;
  v_record RECORD;
  v_existing uuid;
BEGIN
  FOR v_record IN
    SELECT * FROM public.detect_stock_discrepancies(p_organization_id)
  LOOP
    SELECT id INTO v_existing
    FROM public.stock_alerts
    WHERE variant_id = v_record.variant_id
      AND resolved_at IS NULL
    LIMIT 1;

    IF v_existing IS NULL THEN
      INSERT INTO public.stock_alerts (
        organization_id, variant_id, product_name, barcode, size,
        current_stock_qty, calculated_stock_qty, discrepancy
      ) VALUES (
        p_organization_id, v_record.variant_id, v_record.product_name, v_record.barcode, v_record.size,
        v_record.current_stock_qty, v_record.calculated_stock_qty, v_record.discrepancy
      );
      v_new := v_new + 1;
    ELSE
      UPDATE public.stock_alerts
      SET current_stock_qty = v_record.current_stock_qty,
          calculated_stock_qty = v_record.calculated_stock_qty,
          discrepancy = v_record.discrepancy,
          detected_at = now()
      WHERE id = v_existing;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  UPDATE public.stock_alerts sa
  SET resolved_at = now(),
      resolution_notes = 'Auto-resolved: stock became consistent'
  WHERE sa.organization_id = p_organization_id
    AND sa.resolved_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.detect_stock_discrepancies(p_organization_id) d
      WHERE d.variant_id = sa.variant_id
    );
  GET DIAGNOSTICS v_resolved = ROW_COUNT;

  RETURN QUERY SELECT v_new, v_updated, v_resolved;
END;
$$;

-- Cross-org scan
CREATE OR REPLACE FUNCTION public.scan_stock_alerts_all_orgs()
RETURNS TABLE(organization_id uuid, org_name text, new_alerts integer, updated_alerts integer, resolved_alerts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org RECORD;
  v_result RECORD;
BEGIN
  FOR v_org IN
    SELECT id, name FROM public.organizations
  LOOP
    SELECT * INTO v_result FROM public.scan_stock_alerts_for_org(v_org.id);
    organization_id := v_org.id;
    org_name := v_org.name;
    new_alerts := v_result.new_alerts;
    updated_alerts := v_result.updated_alerts;
    resolved_alerts := v_result.resolved_alerts;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.scan_stock_alerts_for_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.scan_stock_alerts_all_orgs() TO authenticated;

-- Schedule via pg_cron if available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'stock-alerts-scan-4h',
      '0 */4 * * *',
      $cron$ SELECT public.scan_stock_alerts_all_orgs(); $cron$
    );
  END IF;
END $$;