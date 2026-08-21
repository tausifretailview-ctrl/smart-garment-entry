-- Phase 1 correction (cn_over_apply_repair_20260606):
-- After soft-delete, trg_sync_sale_payment_status_from_receipts recomputes paid_amount
-- from remaining receipts, so paid_amount ≈ compute_sale_settlement and
-- paid_diverges_from_receipts stays quiet. The residual defect is:
--   credit_note_adjustment receipts soft-deleted while the linked sale never
--   absorbed that credit into sale_return_adjust (SRA ≈ 0).
-- That is the ELLA NOOR / Hanif pattern (invoice unpaid, CN still "available").

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
 SELECT 'paid_diverges_from_receipts'::text AS check_name,
    s.organization_id,
    s.id AS entity_id,
    s.sale_number AS entity_ref,
    round(COALESCE(s.paid_amount, 0) - COALESCE(c.new_paid, 0), 2) AS detail
   FROM sales s
     CROSS JOIN LATERAL public.compute_sale_settlement(s.id, s.organization_id) c
  WHERE s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')
    AND c.new_paid IS NOT NULL
    AND abs(COALESCE(s.paid_amount, 0) - COALESCE(c.new_paid, 0)) > public.sale_settlement_tolerance()
UNION ALL
-- Soft-deleted CN-adjust receipt whose invoice never absorbed via SRA.
-- Catches cn_over_apply_repair_20260606 residual: paid was recomputed to match
-- remaining vouchers, but the invoice is wrongly unpaid / CN still looks available.
 SELECT 'deleted_cn_adjust_without_sra'::text AS check_name,
    ve.organization_id,
    ve.id AS entity_id,
    COALESCE(s.sale_number, ve.voucher_number) AS entity_ref,
    round(COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0), 2) AS detail
   FROM public.voucher_entries ve
     JOIN public.sales s
       ON s.id = ve.reference_id
      AND s.organization_id = ve.organization_id
  WHERE ve.deleted_at IS NOT NULL
    AND ve.voucher_type = 'receipt'
    AND lower(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
    AND ve.reference_id IS NOT NULL
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')
    AND COALESCE(s.sale_return_adjust, 0) <= public.sale_settlement_tolerance()
UNION ALL
 SELECT 'advance_draw_exceeds_booking'::text AS check_name,
    a.organization_id,
    a.id AS entity_id,
    a.advance_number AS entity_ref,
    round(x.applied + COALESCE(r.refunded, 0::numeric) - a.amount, 2) AS detail
   FROM public.customer_advances a
     JOIN LATERAL ( SELECT COALESCE(sum(ve.total_amount), 0::numeric) AS applied
           FROM public.voucher_entries ve
          WHERE ve.organization_id = a.organization_id AND ve.deleted_at IS NULL AND ve.voucher_type = 'receipt'::text AND ve.description ~~ (('%(advance '::text || a.advance_number) || ')%'::text)) x ON true
     LEFT JOIN LATERAL ( SELECT sum(r2.refund_amount) AS refunded
           FROM public.advance_refunds r2
          WHERE r2.advance_id = a.id) r ON true
  WHERE (x.applied + COALESCE(r.refunded, 0::numeric)) > (a.amount + 1::numeric)
UNION ALL
 SELECT 'customer_advance_pool_negative'::text AS check_name,
    t.organization_id,
    t.customer_id AS entity_id,
    t.customer_name AS entity_ref,
    round(t.drawn - t.received, 2) AS detail
   FROM ( SELECT c.organization_id,
             c.id AS customer_id,
             c.customer_name,
             COALESCE(( SELECT sum(a.amount) AS sum
                    FROM public.customer_advances a
                   WHERE a.customer_id = c.id), 0::numeric) AS received,
             COALESCE(( SELECT sum(ve.total_amount) AS sum
                    FROM public.voucher_entries ve
                      JOIN public.sales s2 ON s2.id = ve.reference_id
                   WHERE s2.customer_id = c.id AND ve.deleted_at IS NULL AND ve.voucher_type = 'receipt'::text AND ve.description ~~* 'Adjusted from advance%'::text), 0::numeric) + COALESCE(( SELECT sum(r.refund_amount) AS sum
                    FROM public.advance_refunds r
                      JOIN public.customer_advances a2 ON a2.id = r.advance_id
                   WHERE a2.customer_id = c.id), 0::numeric) AS drawn
            FROM public.customers c
           WHERE (EXISTS ( SELECT 1
                    FROM public.customer_advances a3
                   WHERE a3.customer_id = c.id))) t
  WHERE t.drawn > (t.received + 1::numeric);

COMMENT ON VIEW public.v_accounting_invariants IS
  'Accounting invariants. paid_diverges_from_receipts = paid vs compute_sale_settlement; '
  'deleted_cn_adjust_without_sra = soft-deleted CN-adjust with sale_return_adjust ≈ 0.';

-- Per-org rollup + top 10 for the CN-delete-without-SRA check (alerts / UI).
CREATE OR REPLACE FUNCTION public.get_deleted_cn_adjust_without_sra_digest()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'platform_admin') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  WITH mismatches AS (
    SELECT
      ve.organization_id,
      ve.id AS voucher_id,
      ve.voucher_number,
      s.id AS sale_id,
      s.sale_number,
      round(COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0), 2) AS amount,
      COALESCE(s.paid_amount, 0) AS recorded_paid,
      COALESCE(s.sale_return_adjust, 0) AS sale_return_adjust
    FROM public.voucher_entries ve
    JOIN public.sales s
      ON s.id = ve.reference_id
     AND s.organization_id = ve.organization_id
    WHERE ve.deleted_at IS NOT NULL
      AND ve.voucher_type = 'receipt'
      AND lower(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
      AND ve.reference_id IS NOT NULL
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')
      AND COALESCE(s.sale_return_adjust, 0) <= public.sale_settlement_tolerance()
  ),
  org_agg AS (
    SELECT
      m.organization_id,
      count(*)::int AS failing_count,
      round(sum(m.amount), 2) AS total_abs_discrepancy
    FROM mismatches m
    GROUP BY m.organization_id
  ),
  worst AS (
    SELECT
      m.organization_id,
      jsonb_agg(
        jsonb_build_object(
          'voucher_id', m.voucher_id,
          'voucher_number', m.voucher_number,
          'sale_id', m.sale_id,
          'sale_number', m.sale_number,
          'amount', m.amount,
          'recorded_paid', m.recorded_paid,
          'sale_return_adjust', m.sale_return_adjust
        )
        ORDER BY m.amount DESC
      ) AS worst_rows
    FROM (
      SELECT
        m.*,
        row_number() OVER (PARTITION BY m.organization_id ORDER BY m.amount DESC) AS rn
      FROM mismatches m
    ) m
    WHERE m.rn <= 10
    GROUP BY m.organization_id
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'organization_id', oa.organization_id,
      'organization_name', o.name,
      'failing_count', oa.failing_count,
      'total_abs_discrepancy', oa.total_abs_discrepancy,
      'worst_rows', COALESCE(w.worst_rows, '[]'::jsonb)
    )
    ORDER BY oa.failing_count DESC, oa.total_abs_discrepancy DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM org_agg oa
  LEFT JOIN worst w ON w.organization_id = oa.organization_id
  LEFT JOIN public.organizations o ON o.id = oa.organization_id;

  RETURN jsonb_build_object(
    'check_name', 'deleted_cn_adjust_without_sra',
    'total_failing', (SELECT COALESCE(sum((e->>'failing_count')::int), 0) FROM jsonb_array_elements(v_result) e),
    'organizations', v_result
  );
END;
$$;

COMMENT ON FUNCTION public.get_deleted_cn_adjust_without_sra_digest() IS
  'Platform-admin / service-role: soft-deleted CN-adjust receipts with sale_return_adjust ≈ 0.';

REVOKE ALL ON FUNCTION public.get_deleted_cn_adjust_without_sra_digest() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_deleted_cn_adjust_without_sra_digest() TO authenticated, service_role;
