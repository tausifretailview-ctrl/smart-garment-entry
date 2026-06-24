-- Phase 1B: deliberate orphan soft-delete (product + variants), with server-side re-check.

CREATE OR REPLACE FUNCTION public._product_is_orphan(
  p_organization_id uuid,
  p_product_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.products p
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(pv.stock_qty), 0)::numeric AS total_stock
      FROM public.product_variants pv
      WHERE pv.product_id = p.id
        AND pv.deleted_at IS NULL
    ) vs ON true
    WHERE p.id = p_product_id
      AND p.organization_id = p_organization_id
      AND p.deleted_at IS NULL
      AND COALESCE(vs.total_stock, 0) = 0
      AND NOT public._product_has_active_references(p_organization_id, p.id)
  );
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_orphaned_products(
  p_organization_id uuid,
  p_product_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_now timestamptz := now();
  v_id uuid;
  v_deleted integer := 0;
  v_skipped jsonb := '[]'::jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_organization_ids(v_uid))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  IF p_product_ids IS NULL OR cardinality(p_product_ids) = 0 THEN
    RETURN jsonb_build_object('deleted_count', 0, 'skipped', '[]'::jsonb);
  END IF;

  FOREACH v_id IN ARRAY p_product_ids
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = v_id
        AND p.organization_id = p_organization_id
    ) THEN
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('product_id', v_id, 'reason', 'wrong_organization_or_missing')
      );
      CONTINUE;
    END IF;

    IF NOT public._product_is_orphan(p_organization_id, v_id) THEN
      v_skipped := v_skipped || jsonb_build_array(
        jsonb_build_object('product_id', v_id, 'reason', 'not_orphan')
      );
      CONTINUE;
    END IF;

    UPDATE public.product_variants pv
    SET deleted_at = v_now,
        deleted_by = v_uid,
        updated_at = v_now
    WHERE pv.product_id = v_id
      AND pv.organization_id = p_organization_id
      AND pv.deleted_at IS NULL;

    UPDATE public.products p
    SET deleted_at = v_now,
        deleted_by = v_uid,
        updated_at = v_now
    WHERE p.id = v_id
      AND p.organization_id = p_organization_id
      AND p.deleted_at IS NULL;

    v_deleted := v_deleted + 1;
  END LOOP;

  RETURN jsonb_build_object('deleted_count', v_deleted, 'skipped', v_skipped);
END;
$$;

COMMENT ON FUNCTION public.soft_delete_orphaned_products(uuid, uuid[]) IS
  'Soft-deletes orphaned products and all their variants after re-validating orphan status. Recoverable via Recycle Bin.';

GRANT EXECUTE ON FUNCTION public.soft_delete_orphaned_products(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public._product_is_orphan(uuid, uuid) TO authenticated;
