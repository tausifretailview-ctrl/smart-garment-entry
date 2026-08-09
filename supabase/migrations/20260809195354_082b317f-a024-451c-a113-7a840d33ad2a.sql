-- 1) Extend the invariant view with the defect classes already seen in production.
CREATE OR REPLACE VIEW public.v_accounting_invariants
WITH (security_invoker = true) AS
 SELECT 'receipts_exceed_invoice'::text AS check_name,
    s.organization_id,
    s.id AS entity_id,
    s.sale_number AS entity_ref,
    round(((sum(ve.total_amount) - s.net_amount) - COALESCE(s.sale_return_adjust, (0)::numeric)), 2) AS detail
   FROM (sales s
     JOIN voucher_entries ve ON ((ve.reference_id = s.id)))
  WHERE ((ve.voucher_type = 'receipt'::text) AND (ve.deleted_at IS NULL) AND (s.deleted_at IS NULL) AND (COALESCE(s.is_cancelled, false) = false) AND (COALESCE(s.payment_status, ''::text) <> ALL (ARRAY['cancelled'::text, 'hold'::text])))
  GROUP BY s.id, s.organization_id, s.sale_number, s.net_amount, s.sale_return_adjust
 HAVING (sum(ve.total_amount) > ((s.net_amount + COALESCE(s.sale_return_adjust, (0)::numeric)) + (1)::numeric))
UNION ALL
 SELECT 'duplicate_voucher_number'::text AS check_name,
    voucher_entries.organization_id,
    (array_agg(voucher_entries.id ORDER BY voucher_entries.created_at))[1] AS entity_id,
    voucher_entries.voucher_number AS entity_ref,
    (count(*))::numeric AS detail
   FROM voucher_entries
  WHERE (voucher_entries.deleted_at IS NULL)
  GROUP BY voucher_entries.organization_id, voucher_entries.voucher_number
 HAVING (count(*) > 1)
UNION ALL
 SELECT 'rapid_duplicate_receipt'::text AS check_name,
    a.organization_id,
    a.id AS entity_id,
    a.voucher_number AS entity_ref,
    a.total_amount AS detail
   FROM (voucher_entries a
     JOIN voucher_entries b ON (((b.organization_id = a.organization_id) AND (b.reference_id = a.reference_id) AND (b.total_amount = a.total_amount) AND (b.id > a.id) AND (b.created_at <= (a.created_at + '00:05:00'::interval)))))
  WHERE ((a.voucher_type = 'receipt'::text) AND (a.deleted_at IS NULL) AND (b.voucher_type = 'receipt'::text) AND (b.deleted_at IS NULL) AND (a.reference_id IS NOT NULL))
UNION ALL
-- Refunds beyond what the booking still holds (amount - used_amount).
 SELECT 'advance_refund_exceeds_available'::text AS check_name,
    a.organization_id,
    a.id AS entity_id,
    a.advance_number AS entity_ref,
    round(sum(r.refund_amount) - (a.amount - COALESCE(a.used_amount, 0)), 2) AS detail
   FROM customer_advances a
     JOIN advance_refunds r ON r.advance_id = a.id
  GROUP BY a.id, a.organization_id, a.advance_number, a.amount, a.used_amount
 HAVING sum(r.refund_amount) > (a.amount - COALESCE(a.used_amount, 0)) + 1
UNION ALL
-- Refunds beyond the booking's own value: unambiguous over-refund.
 SELECT 'advance_refund_exceeds_booking'::text AS check_name,
    a.organization_id,
    a.id AS entity_id,
    a.advance_number AS entity_ref,
    round(sum(r.refund_amount) - a.amount, 2) AS detail
   FROM customer_advances a
     JOIN advance_refunds r ON r.advance_id = a.id
  GROUP BY a.id, a.organization_id, a.advance_number, a.amount
 HAVING sum(r.refund_amount) > a.amount + 1
UNION ALL
-- Advance credit applied to an invoice beyond the invoice's own value.
 SELECT 'advance_applied_exceeds_invoice'::text AS check_name,
    s.organization_id,
    s.id AS entity_id,
    s.sale_number AS entity_ref,
    round(sum(ve.total_amount) - s.net_amount, 2) AS detail
   FROM sales s
     JOIN voucher_entries ve ON ve.reference_id = s.id
      AND ve.voucher_type = 'receipt'
      AND ve.payment_method = 'advance_adjustment'
      AND ve.deleted_at IS NULL
  WHERE s.deleted_at IS NULL AND COALESCE(s.is_cancelled, false) = false
  GROUP BY s.id, s.organization_id, s.sale_number, s.net_amount
 HAVING sum(ve.total_amount) > s.net_amount + 1
UNION ALL
-- Unclamped over-payment: paid_amount above the invoice's settleable value.
 SELECT 'paid_exceeds_net'::text AS check_name,
    s.organization_id,
    s.id AS entity_id,
    s.sale_number AS entity_ref,
    round(COALESCE(s.paid_amount, 0) - (s.net_amount + COALESCE(s.sale_return_adjust, 0)), 2) AS detail
   FROM sales s
  WHERE s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.paid_amount, 0) > s.net_amount + COALESCE(s.sale_return_adjust, 0) + 1
UNION ALL
-- paid_amount that cannot be reconstructed from its receipt vouchers
-- (legacy-baselined invoices are excluded: their history predates vouchers).
 SELECT 'paid_diverges_from_receipts'::text AS check_name,
    s.organization_id,
    s.id AS entity_id,
    s.sale_number AS entity_ref,
    round(COALESCE(s.paid_amount, 0) - v.amt, 2) AS detail
   FROM sales s
     LEFT JOIN LATERAL (
       SELECT COALESCE(sum(ve.total_amount), 0) AS amt
       FROM voucher_entries ve
       WHERE ve.reference_id = s.id
         AND ve.voucher_type = 'receipt'
         AND ve.deleted_at IS NULL
     ) v ON true
  WHERE s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND s.legacy_paid_baseline IS NULL
    AND abs(COALESCE(s.paid_amount, 0) - v.amt) > 1;

-- 2) Daily snapshot so change-since-yesterday is reportable.
CREATE TABLE IF NOT EXISTS public.invariant_daily_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  check_name text NOT NULL,
  organization_id uuid,
  violation_count integer NOT NULL DEFAULT 0,
  total_detail numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS invariant_daily_snapshot_key
  ON public.invariant_daily_snapshot (snapshot_date, check_name, COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT ON public.invariant_daily_snapshot TO authenticated;
GRANT ALL ON public.invariant_daily_snapshot TO service_role;

ALTER TABLE public.invariant_daily_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins read invariant snapshots" ON public.invariant_daily_snapshot;
CREATE POLICY "Platform admins read invariant snapshots"
  ON public.invariant_daily_snapshot FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'));

-- 3) Snapshot routine.
CREATE OR REPLACE FUNCTION public.snapshot_accounting_invariants(p_date date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  DELETE FROM public.invariant_daily_snapshot WHERE snapshot_date = p_date;

  INSERT INTO public.invariant_daily_snapshot (snapshot_date, check_name, organization_id, violation_count, total_detail)
  SELECT p_date, check_name, organization_id, count(*)::int, round(COALESCE(sum(detail), 0), 2)
  FROM public.v_accounting_invariants
  GROUP BY check_name, organization_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'snapshot_date', p_date,
    'rows', v_rows,
    'total_violations', (SELECT COALESCE(sum(violation_count), 0) FROM public.invariant_daily_snapshot WHERE snapshot_date = p_date)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_accounting_invariants(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_accounting_invariants(date) TO service_role;

-- 4) Digest: today vs previous snapshot, per check and per organisation.
CREATE OR REPLACE FUNCTION public.get_invariant_digest(p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  check_name text,
  organization_id uuid,
  organization_name text,
  violation_count integer,
  total_detail numeric,
  prev_count integer,
  delta integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH prev_date AS (
    SELECT max(snapshot_date) AS d
    FROM public.invariant_daily_snapshot
    WHERE snapshot_date < p_date
  ),
  cur AS (
    SELECT s.check_name, s.organization_id, s.violation_count, s.total_detail
    FROM public.invariant_daily_snapshot s WHERE s.snapshot_date = p_date
  ),
  prv AS (
    SELECT s.check_name, s.organization_id, s.violation_count
    FROM public.invariant_daily_snapshot s, prev_date
    WHERE s.snapshot_date = prev_date.d
  )
  SELECT
    COALESCE(c.check_name, p.check_name),
    COALESCE(c.organization_id, p.organization_id),
    o.name,
    COALESCE(c.violation_count, 0),
    COALESCE(c.total_detail, 0),
    COALESCE(p.violation_count, 0),
    COALESCE(c.violation_count, 0) - COALESCE(p.violation_count, 0)
  FROM cur c
  FULL OUTER JOIN prv p
    ON p.check_name = c.check_name
   AND COALESCE(p.organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
     = COALESCE(c.organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  LEFT JOIN public.organizations o
    ON o.id = COALESCE(c.organization_id, p.organization_id)
  WHERE public.has_role(auth.uid(), 'platform_admin') OR auth.uid() IS NULL
  ORDER BY 1, 4 DESC;
$$;

REVOKE ALL ON FUNCTION public.get_invariant_digest(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_invariant_digest(date) TO authenticated, service_role;