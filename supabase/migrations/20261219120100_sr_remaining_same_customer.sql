-- Pass-2 leftover SRA must stay on the same customer (JS allocateCnAdjustmentsToSaleReturns).
-- Org-wide pass-2 let earlier ELLA NOOR returns consume Almas INV-3009 SRA ₹4,700, so
-- refunded remaining stayed ₹6,750 and signed became −₹4,700 (6750 leftover − 2050 refund).
-- CREATE OR REPLACE same OUT row — no DROP.

CREATE OR REPLACE FUNCTION public._org_sale_return_balance_remaining(p_organization_id uuid)
RETURNS TABLE (
  sale_return_id uuid,
  out_customer_id uuid,
  remaining numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  leftover_amt jsonb := '{}'::jsonb;
  leftover_cid jsonb := '{}'::jsonb;
  consumed jsonb := '{}'::jsonb;
  r record;
  avail numeric;
  take numeric;
  sr_left numeric;
  already numeric;
  keys text[];
  k text;
BEGIN
  FOR r IN
    SELECT
      s.id::text AS sid,
      s.customer_id::text AS cid,
      COALESCE(s.sale_return_adjust, 0)::numeric AS sra
    FROM public.sales s
    WHERE s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND s.customer_id IS NOT NULL
      AND COALESCE(s.sale_return_adjust, 0) > 0.005
  LOOP
    leftover_amt := leftover_amt || jsonb_build_object(r.sid, r.sra);
    leftover_cid := leftover_cid || jsonb_build_object(r.sid, r.cid);
  END LOOP;

  FOR r IN
    SELECT
      sr.id::text AS srid,
      sr.customer_id::text AS cid,
      sr.linked_sale_id::text AS lid,
      COALESCE(sr.net_amount, 0)::numeric AS net
    FROM public.sale_returns sr
    WHERE sr.organization_id = p_organization_id
      AND sr.deleted_at IS NULL
      AND sr.linked_sale_id IS NOT NULL
      AND sr.customer_id IS NOT NULL
    ORDER BY sr.return_date NULLS LAST, sr.created_at NULLS LAST, sr.id
  LOOP
    IF leftover_cid ->> r.lid IS DISTINCT FROM r.cid THEN
      CONTINUE;
    END IF;
    avail := COALESCE((leftover_amt ->> r.lid)::numeric, 0);
    IF avail <= 0 THEN
      CONTINUE;
    END IF;
    take := LEAST(r.net, avail);
    leftover_amt := leftover_amt || jsonb_build_object(r.lid, avail - take);
    consumed := consumed || jsonb_build_object(
      r.srid,
      COALESCE((consumed ->> r.srid)::numeric, 0) + take
    );
  END LOOP;

  SELECT ARRAY(
    SELECT key
    FROM jsonb_each_text(leftover_amt)
    WHERE value::numeric > 0.005
    ORDER BY key
  ) INTO keys;

  FOR r IN
    SELECT
      sr.id::text AS srid,
      sr.customer_id::text AS cid,
      COALESCE(sr.net_amount, 0)::numeric AS net
    FROM public.sale_returns sr
    WHERE sr.organization_id = p_organization_id
      AND sr.deleted_at IS NULL
      AND sr.customer_id IS NOT NULL
    ORDER BY sr.return_date NULLS LAST, sr.created_at NULLS LAST, sr.id
  LOOP
    already := COALESCE((consumed ->> r.srid)::numeric, 0);
    sr_left := r.net - already;
    IF sr_left <= 0.005 THEN
      CONTINUE;
    END IF;
    IF keys IS NULL THEN
      CONTINUE;
    END IF;
    FOREACH k IN ARRAY keys LOOP
      IF leftover_cid ->> k IS DISTINCT FROM r.cid THEN
        CONTINUE;
      END IF;
      avail := COALESCE((leftover_amt ->> k)::numeric, 0);
      IF avail <= 0.005 THEN
        CONTINUE;
      END IF;
      take := LEAST(avail, sr_left);
      leftover_amt := leftover_amt || jsonb_build_object(k, avail - take);
      already := already + take;
      consumed := consumed || jsonb_build_object(r.srid, already);
      sr_left := sr_left - take;
      EXIT WHEN sr_left <= 0.005;
    END LOOP;
  END LOOP;

  RETURN QUERY
  SELECT
    sr.id,
    sr.customer_id,
    CASE
      WHEN lower(trim(COALESCE(sr.credit_status, ''))) = 'refunded'
        OR COALESCE(lower(sr.refund_type::text), '') = 'cash_refund'
      THEN GREATEST(
        0::numeric,
        COALESCE(sr.net_amount, 0) - COALESCE((consumed ->> sr.id::text)::numeric, 0)
      )
      ELSE public._sale_return_remaining_credit_for_balance(
        sr.net_amount,
        sr.credit_available_balance,
        COALESCE(ls.sale_return_adjust, 0)
      )
    END
  FROM public.sale_returns sr
  LEFT JOIN public.sales ls
    ON ls.id = sr.linked_sale_id
   AND ls.organization_id = p_organization_id
   AND ls.deleted_at IS NULL
  WHERE sr.organization_id = p_organization_id
    AND sr.deleted_at IS NULL;
END;
$$;

COMMENT ON FUNCTION public._org_sale_return_balance_remaining(uuid) IS
  'Remaining sale-return credit. SRA allocation is per customer (not org-wide). '
  'Refunded/cash_refund: net minus allocated SRA. Else CAB / linked helper.';

REVOKE ALL ON FUNCTION public._org_sale_return_balance_remaining(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._org_sale_return_balance_remaining(uuid) TO authenticated, service_role;
