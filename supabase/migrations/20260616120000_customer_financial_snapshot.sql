-- Unified read model: lifetime outstanding, unused advance (net refunds), CN pool from sale returns.
-- All UI surfaces should use get_customer_financial_snapshot (single customer) or _batch (pickers).

CREATE OR REPLACE FUNCTION public._customer_advance_available(
  p_customer_id uuid,
  p_organization_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH adv AS (
    SELECT
      COALESCE(SUM(ca.amount), 0) AS total_amount,
      COALESCE(SUM(ca.used_amount), 0) AS total_used
    FROM public.customer_advances ca
    WHERE ca.customer_id = p_customer_id
      AND ca.organization_id = p_organization_id
  ),
  ref AS (
    SELECT COALESCE(SUM(ar.refund_amount), 0) AS total_refunds
    FROM public.advance_refunds ar
    INNER JOIN public.customer_advances ca ON ca.id = ar.advance_id
    WHERE ca.customer_id = p_customer_id
      AND ca.organization_id = p_organization_id
  )
  SELECT GREATEST(
    0::numeric,
    (SELECT total_amount - total_used FROM adv) - (SELECT total_refunds FROM ref)
  )::numeric;
$$;

CREATE OR REPLACE FUNCTION public._customer_cn_pool_row_available(
  p_net_amount numeric,
  p_credit_available_balance numeric,
  p_credit_note_id uuid,
  p_cn_credit_amount numeric,
  p_cn_used_amount numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_credit_note_id IS NOT NULL THEN
      GREATEST(0::numeric, COALESCE(p_cn_credit_amount, 0) - COALESCE(p_cn_used_amount, 0))
    WHEN p_credit_available_balance IS NOT NULL THEN
      GREATEST(0::numeric, p_credit_available_balance)
    ELSE
      GREATEST(0::numeric, COALESCE(p_net_amount, 0))
  END;
$$;

CREATE OR REPLACE FUNCTION public._customer_cn_available_total(
  p_customer_id uuid,
  p_organization_id uuid
)
RETURNS TABLE (
  cn_available_total numeric,
  cn_pending_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH eligible AS (
    SELECT
      sr.id,
      sr.net_amount,
      sr.credit_available_balance,
      sr.credit_note_id,
      cn.credit_amount AS cn_credit_amount,
      cn.used_amount AS cn_used_amount,
      public._customer_cn_pool_row_available(
        sr.net_amount,
        sr.credit_available_balance,
        sr.credit_note_id,
        cn.credit_amount,
        cn.used_amount
      ) AS row_available
    FROM public.sale_returns sr
    LEFT JOIN public.credit_notes cn
      ON cn.id = sr.credit_note_id
      AND cn.organization_id = p_organization_id
      AND cn.deleted_at IS NULL
    WHERE sr.customer_id = p_customer_id
      AND sr.organization_id = p_organization_id
      AND sr.deleted_at IS NULL
      AND lower(COALESCE(sr.credit_status, '')) NOT IN ('refunded')
      AND COALESCE(lower(sr.refund_type::text), '') <> 'cash_refund'
      AND (
        lower(COALESCE(sr.credit_status, '')) IN (
          'pending',
          'partially_adjusted',
          'adjusted_outstanding'
        )
        OR (
          lower(COALESCE(sr.credit_status, '')) = 'adjusted'
          AND sr.linked_sale_id IS NULL
        )
      )
  )
  SELECT
    COALESCE(SUM(row_available), 0)::numeric AS cn_available_total,
    COALESCE(COUNT(*) FILTER (WHERE row_available > 0.01), 0)::integer AS cn_pending_count
  FROM eligible;
$$;

CREATE OR REPLACE FUNCTION public.get_customer_financial_snapshot(
  p_customer_id uuid,
  p_organization_id uuid
)
RETURNS TABLE (
  outstanding_dr numeric,
  advance_available numeric,
  cn_available_total numeric,
  cn_pending_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = p_customer_id
      AND c.organization_id = p_organization_id
      AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Customer not found in organization' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    public.get_customer_true_outstanding(p_customer_id, p_organization_id)::numeric AS outstanding_dr,
    public._customer_advance_available(p_customer_id, p_organization_id)::numeric AS advance_available,
    cn.cn_available_total,
    cn.cn_pending_count
  FROM public._customer_cn_available_total(p_customer_id, p_organization_id) AS cn;
END;
$$;

COMMENT ON FUNCTION public.get_customer_financial_snapshot(uuid, uuid) IS
  'Single read model for UI: outstanding_dr (lifetime Dr), advance_available (unused advance net refunds), '
  'cn_available_total (settlement pool from sale_returns + live credit_notes). Read-only; writes unchanged.';

CREATE OR REPLACE FUNCTION public.get_customer_financial_snapshot_batch(
  p_organization_id uuid,
  p_customer_ids uuid[]
)
RETURNS TABLE (
  customer_id uuid,
  outstanding_dr numeric,
  advance_available numeric,
  cn_available_total numeric,
  cn_pending_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cid uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_customer_ids IS NULL OR array_length(p_customer_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  FOREACH v_cid IN ARRAY p_customer_ids
  LOOP
  IF NOT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = v_cid
      AND c.organization_id = p_organization_id
      AND c.deleted_at IS NULL
  ) THEN
    CONTINUE;
  END IF;

    RETURN QUERY
    SELECT
      v_cid,
      s.outstanding_dr,
      s.advance_available,
      s.cn_available_total,
      s.cn_pending_count
    FROM public.get_customer_financial_snapshot(v_cid, p_organization_id) AS s;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.get_customer_financial_snapshot_batch(uuid, uuid[]) IS
  'Batch wrapper for customer pickers; same numbers as get_customer_financial_snapshot per id.';

GRANT EXECUTE ON FUNCTION public._customer_advance_available(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._customer_cn_pool_row_available(numeric, numeric, uuid, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._customer_cn_available_total(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_financial_snapshot(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_financial_snapshot_batch(uuid, uuid[]) TO authenticated, service_role;
