-- Customer balances: remaining sale-return credit worked out customer by customer.
--
-- _org_sale_return_balance_remaining feeds Customer Balances, the payment picker and the
-- customer balance checks. It walked every sale with an S/R adjust and every sale return of
-- the shop, keeping its running totals in jsonb objects keyed over the whole shop. Each step
-- copied the whole object (jsonb || makes a new value), and for every return it scanned the
-- leftovers of every customer. The work grew with the square of the shop's history, so shops
-- with many returns saw these screens slow down and time out (review item D10).
--
-- The rules are unchanged (20261219120100): S/R adjust left on a bill is only ever used by
-- returns of the same customer. So the same allocation is now done customer by customer in
-- one ordered pass, with running totals that only hold that customer's bills. Same inputs,
-- same order, same result; the output columns are unchanged.
--
-- Replaces the function body only (CREATE OR REPLACE, same signature). Changes no data.
-- Safe to run twice. Undo: run 20261219120100_sr_remaining_same_customer.sql again.

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
  -- Running totals for the customer being processed only.
  leftover_amt jsonb := '{}'::jsonb;   -- sale id -> S/R adjust still unused
  consumed jsonb := '{}'::jsonb;       -- sale return id -> S/R adjust allocated to it
  cur_cid text := NULL;
  cur_kind int := 0;
  keys text[];
  -- Allocations of every customer, for the final result.
  out_srid uuid[] := '{}';
  out_amt numeric[] := '{}';
  r record;
  avail numeric;
  take numeric;
  sr_left numeric;
  already numeric;
  k text;
  e record;
BEGIN
  FOR r IN
    -- kind 1: bills with S/R adjust (pass 1), kind 2: returns linked to a bill (pass 2),
    -- kind 3: all returns with a customer (pass 3). Within a customer, passes run in order,
    -- and returns keep the shop-wide order the previous version used.
    SELECT * FROM (
      SELECT s.customer_id::text AS cid, 1 AS kind, s.id::text AS rid, NULL::text AS lid,
             COALESCE(s.sale_return_adjust, 0)::numeric AS amt,
             NULL::date AS rdate, NULL::timestamptz AS rcreated, s.id AS rorder
      FROM public.sales s
      WHERE s.organization_id = p_organization_id
        AND s.deleted_at IS NULL
        AND s.customer_id IS NOT NULL
        AND COALESCE(s.sale_return_adjust, 0) > 0.005
      UNION ALL
      SELECT sr.customer_id::text, 2, sr.id::text, sr.linked_sale_id::text,
             COALESCE(sr.net_amount, 0)::numeric,
             sr.return_date, sr.created_at, sr.id
      FROM public.sale_returns sr
      WHERE sr.organization_id = p_organization_id
        AND sr.deleted_at IS NULL
        AND sr.linked_sale_id IS NOT NULL
        AND sr.customer_id IS NOT NULL
      UNION ALL
      SELECT sr.customer_id::text, 3, sr.id::text, NULL,
             COALESCE(sr.net_amount, 0)::numeric,
             sr.return_date, sr.created_at, sr.id
      FROM public.sale_returns sr
      WHERE sr.organization_id = p_organization_id
        AND sr.deleted_at IS NULL
        AND sr.customer_id IS NOT NULL
    ) x
    ORDER BY x.cid, x.kind, x.rdate NULLS LAST, x.rcreated NULLS LAST, x.rorder
  LOOP
    IF cur_cid IS DISTINCT FROM r.cid THEN
      -- Next customer: keep what was allocated, start with empty totals.
      FOR e IN SELECT key, value FROM jsonb_each_text(consumed) LOOP
        out_srid := out_srid || e.key::uuid;
        out_amt := out_amt || e.value::numeric;
      END LOOP;
      leftover_amt := '{}'::jsonb;
      consumed := '{}'::jsonb;
      keys := NULL;
      cur_cid := r.cid;
      cur_kind := 0;
    END IF;

    IF r.kind = 3 AND cur_kind <> 3 THEN
      -- Bills of this customer with S/R adjust left after pass 2, in bill-id order.
      SELECT ARRAY(
        SELECT key FROM jsonb_each_text(leftover_amt)
        WHERE value::numeric > 0.005
        ORDER BY key
      ) INTO keys;
    END IF;
    cur_kind := r.kind;

    IF r.kind = 1 THEN
      leftover_amt := leftover_amt || jsonb_build_object(r.rid, r.amt);

    ELSIF r.kind = 2 THEN
      -- A bill of another customer is not in this customer's totals: skipped, as before.
      IF NOT (leftover_amt ? r.lid) THEN
        CONTINUE;
      END IF;
      avail := COALESCE((leftover_amt ->> r.lid)::numeric, 0);
      IF avail <= 0 THEN
        CONTINUE;
      END IF;
      take := LEAST(r.amt, avail);
      leftover_amt := leftover_amt || jsonb_build_object(r.lid, avail - take);
      consumed := consumed || jsonb_build_object(
        r.rid,
        COALESCE((consumed ->> r.rid)::numeric, 0) + take
      );

    ELSE
      already := COALESCE((consumed ->> r.rid)::numeric, 0);
      sr_left := r.amt - already;
      IF sr_left <= 0.005 OR keys IS NULL THEN
        CONTINUE;
      END IF;
      FOREACH k IN ARRAY keys LOOP
        avail := COALESCE((leftover_amt ->> k)::numeric, 0);
        IF avail <= 0.005 THEN
          CONTINUE;
        END IF;
        take := LEAST(avail, sr_left);
        leftover_amt := leftover_amt || jsonb_build_object(k, avail - take);
        already := already + take;
        consumed := consumed || jsonb_build_object(r.rid, already);
        sr_left := sr_left - take;
        EXIT WHEN sr_left <= 0.005;
      END LOOP;
    END IF;
  END LOOP;

  -- Last customer.
  FOR e IN SELECT key, value FROM jsonb_each_text(consumed) LOOP
    out_srid := out_srid || e.key::uuid;
    out_amt := out_amt || e.value::numeric;
  END LOOP;

  RETURN QUERY
  WITH alloc AS (
    SELECT a.srid, a.amt FROM unnest(out_srid, out_amt) AS a(srid, amt)
  )
  SELECT
    sr.id,
    sr.customer_id,
    CASE
      WHEN lower(trim(COALESCE(sr.credit_status, ''))) = 'refunded'
        OR COALESCE(lower(sr.refund_type::text), '') = 'cash_refund'
      THEN GREATEST(
        0::numeric,
        COALESCE(sr.net_amount, 0) - COALESCE(al.amt, 0)
      )
      ELSE public._sale_return_remaining_credit_for_balance(
        sr.net_amount,
        sr.credit_available_balance,
        COALESCE(ls.sale_return_adjust, 0)
      )
    END
  FROM public.sale_returns sr
  LEFT JOIN alloc al ON al.srid = sr.id
  LEFT JOIN public.sales ls
    ON ls.id = sr.linked_sale_id
   AND ls.organization_id = p_organization_id
   AND ls.deleted_at IS NULL
  WHERE sr.organization_id = p_organization_id
    AND sr.deleted_at IS NULL;
END;
$$;

COMMENT ON FUNCTION public._org_sale_return_balance_remaining(uuid) IS
  'Remaining sale-return credit. SRA allocation is per customer (not org-wide), done one customer '
  'at a time. Refunded/cash_refund: net minus allocated SRA. Else CAB / linked helper.';

REVOKE ALL ON FUNCTION public._org_sale_return_balance_remaining(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._org_sale_return_balance_remaining(uuid) TO authenticated, service_role;
