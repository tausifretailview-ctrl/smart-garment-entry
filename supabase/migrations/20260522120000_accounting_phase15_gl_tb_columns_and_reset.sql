-- Phase 15: Fix GL trial balance presentation (credit-normal accounts were inverted into trial_debit).
-- Add admin_reset_org_gl to clear org journals and reset sale/purchase journal_status for backfill.

CREATE OR REPLACE FUNCTION public.get_gl_trial_balance(p_org_id uuid, p_from_date date, p_to_date date)
RETURNS TABLE (
  account_id uuid,
  account_code text,
  account_name text,
  account_type text,
  movement_debit numeric,
  movement_credit numeric,
  trial_debit numeric,
  trial_credit numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_org_id IS NULL OR NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_to_date < p_from_date THEN
    RAISE EXCEPTION 'p_to_date must be >= p_from_date' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT
      ca.id AS aid,
      ca.account_code AS acode,
      ca.account_name AS aname,
      ca.account_type AS atype,
      COALESCE(SUM(jl.debit_amount), 0)::numeric(14, 2) AS md,
      COALESCE(SUM(jl.credit_amount), 0)::numeric(14, 2) AS mc
    FROM public.chart_of_accounts ca
    INNER JOIN public.journal_lines jl ON jl.account_id = ca.id
    INNER JOIN public.journal_entries je ON je.id = jl.journal_entry_id
      AND je.organization_id = p_org_id
      AND je.date >= p_from_date
      AND je.date <= p_to_date
    WHERE ca.organization_id = p_org_id
    GROUP BY ca.id, ca.account_code, ca.account_name, ca.account_type
    HAVING COALESCE(SUM(jl.debit_amount), 0) <> 0 OR COALESCE(SUM(jl.credit_amount), 0) <> 0
  )
  SELECT
    agg.aid AS account_id,
    agg.acode AS account_code,
    agg.aname AS account_name,
    agg.atype AS account_type,
    agg.md AS movement_debit,
    agg.mc AS movement_credit,
    GREATEST(agg.md - agg.mc, 0::numeric) AS trial_debit,
    GREATEST(agg.mc - agg.md, 0::numeric) AS trial_credit
  FROM agg
  ORDER BY agg.acode;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_org_gl(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted_lines bigint;
  v_deleted_entries bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  IF p_org_id IS NULL OR NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'platform_admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = p_org_id
        AND om.role = 'admin'::public.app_role
    )
  ) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.journal_lines jl
  USING public.journal_entries je
  WHERE jl.journal_entry_id = je.id
    AND je.organization_id = p_org_id;
  GET DIAGNOSTICS v_deleted_lines = ROW_COUNT;

  DELETE FROM public.journal_entries
  WHERE organization_id = p_org_id;
  GET DIAGNOSTICS v_deleted_entries = ROW_COUNT;

  UPDATE public.sales
  SET journal_status = 'pending', journal_error = NULL
  WHERE organization_id = p_org_id;

  UPDATE public.purchase_bills
  SET journal_status = 'pending', journal_error = NULL
  WHERE organization_id = p_org_id;

  RETURN jsonb_build_object(
    'ok', true,
    'journal_lines_deleted', v_deleted_lines,
    'journal_entries_deleted', v_deleted_entries
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_gl_trial_balance(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_org_gl(uuid) TO authenticated;
