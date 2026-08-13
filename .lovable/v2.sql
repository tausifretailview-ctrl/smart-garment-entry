CREATE OR REPLACE VIEW public.v_accounting_invariants AS
 SELECT 'receipts_exceed_invoice'::text AS check_name,
    s.organization_id,
    s.id AS entity_id,
    s.sale_number AS entity_ref,
    round(sum(ve.total_amount) - s.net_amount - COALESCE(s.sale_return_adjust, 0::numeric), 2) AS detail
   FROM sales s
     JOIN voucher_entries ve ON ve.reference_id = s.id
  WHERE ve.voucher_type = 'receipt'::text AND ve.deleted_at IS NULL AND s.deleted_at IS NULL AND COALESCE(s.is_cancelled, false) = false AND (COALESCE(s.payment_status, ''::text) <> ALL (ARRAY['cancelled'::text, 'hold'::text]))
  GROUP BY s.id, s.organization_id, s.sale_number, s.net_amount, s.sale_return_adjust
 HAVING sum(ve.total_amount) > (s.net_amount + COALESCE(s.sale_return_adjust, 0::numeric) + 1::numeric)
UNION ALL
 SELECT 'duplicate_voucher_number'::text AS check_name,
    ve.organization_id,
    (array_agg(ve.id ORDER BY ve.created_at))[1] AS entity_id,
    ve.voucher_number AS entity_ref,
    count(*)::numeric AS detail
   FROM voucher_entries ve
  WHERE ve.deleted_at IS NULL
  GROUP BY ve.organization_id, ve.voucher_number
 HAVING count(*) > 1
UNION ALL
 SELECT 'rapid_duplicate_receipt'::text AS check_name,
    a.organization_id,
    a.id AS entity_id,
    a.voucher_number AS entity_ref,
    a.total_amount AS detail
   FROM voucher_entries a
     JOIN voucher_entries b ON b.organization_id = a.organization_id AND b.reference_id = a.reference_id AND b.total_amount = a.total_amount AND b.id > a.id AND b.created_at <= (a.created_at + '00:05:00'::interval)
  WHERE a.voucher_type = 'receipt'::text AND a.deleted_at IS NULL AND b.voucher_type = 'receipt'::text AND b.deleted_at IS NULL AND a.reference_id IS NOT NULL
UNION ALL
 SELECT 'advance_refund_exceeds_available'::text AS check_name,
    a.organization_id,
    a.id AS entity_id,
    a.advance_number AS entity_ref,
    round(sum(r.refund_amount) - (a.amount - COALESCE(a.used_amount, 0::numeric)), 2) AS detail
   FROM customer_advances a
     JOIN advance_refunds r ON r.advance_id = a.id
  GROUP BY a.id, a.organization_id, a.advance_number, a.amount, a.used_amount
 HAVING sum(r.refund_amount) > (a.amount - COALESCE(a.used_amount, 0::numeric) + 1::numeric)
UNION ALL
 SELECT 'advance_refund_exceeds_booking'::text AS check_name,
    a.organization_id,
    a.id AS entity_id,
    a.advance_number AS entity_ref,
    round(sum(r.refund_amount) - a.amount, 2) AS detail
   FROM customer_advances a
     JOIN advance_refunds r ON r.advance_id = a.id
  GROUP BY a.id, a.organization_id, a.advance_number, a.amount
 HAVING sum(r.refund_amount) > (a.amount + 1::numeric)
UNION ALL
 SELECT 'advance_applied_exceeds_invoice'::text AS check_name,
    s.organization_id,
    s.id AS entity_id,
    s.sale_number AS entity_ref,
    round(sum(ve.total_amount) - s.net_amount, 2) AS detail
   FROM sales s
     JOIN voucher_entries ve ON ve.reference_id = s.id AND ve.voucher_type = 'receipt'::text AND ve.payment_method = 'advance_adjustment'::text AND ve.deleted_at IS NULL
  WHERE s.deleted_at IS NULL AND COALESCE(s.is_cancelled, false) = false
  GROUP BY s.id, s.organization_id, s.sale_number, s.net_amount
 HAVING sum(ve.total_amount) > (s.net_amount + 1::numeric)
UNION ALL
 SELECT 'paid_exceeds_net'::text AS check_name,
    s.organization_id,
    s.id AS entity_id,
    s.sale_number AS entity_ref,
    round(COALESCE(s.paid_amount, 0::numeric) - (s.net_amount + COALESCE(s.sale_return_adjust, 0::numeric)), 2) AS detail
   FROM sales s
  WHERE s.deleted_at IS NULL AND COALESCE(s.is_cancelled, false) = false AND COALESCE(s.paid_amount, 0::numeric) > (s.net_amount + COALESCE(s.sale_return_adjust, 0::numeric) + 1::numeric)
UNION ALL
 SELECT 'paid_diverges_from_receipts'::text AS check_name,
    s.organization_id,
    s.id AS entity_id,
    s.sale_number AS entity_ref,
    round(COALESCE(s.paid_amount, 0::numeric) - v.amt, 2) AS detail
   FROM sales s
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(ve.total_amount + COALESCE(ve.discount_amount, 0::numeric)), 0::numeric) AS amt
           FROM voucher_entries ve
          WHERE ve.reference_id = s.id AND ve.voucher_type = 'receipt'::text AND ve.deleted_at IS NULL) v ON true
  WHERE s.deleted_at IS NULL AND COALESCE(s.is_cancelled, false) = false AND s.legacy_paid_baseline IS NULL AND abs(COALESCE(s.paid_amount, 0::numeric) - v.amt) > 1::numeric
UNION ALL
 SELECT 'advance_draw_exceeds_booking'::text AS check_name,
    a.organization_id,
    a.id AS entity_id,
    a.advance_number AS entity_ref,
    round(x.applied + COALESCE(r.refunded, 0::numeric) - a.amount, 2) AS detail
   FROM customer_advances a
     JOIN LATERAL ( SELECT COALESCE(sum(ve.total_amount), 0::numeric) AS applied
           FROM voucher_entries ve
          WHERE ve.organization_id = a.organization_id AND ve.deleted_at IS NULL AND ve.voucher_type = 'receipt'::text AND ve.description ~~ (('%(advance '::text || a.advance_number) || ')%'::text)) x ON true
     LEFT JOIN LATERAL ( SELECT sum(r2.refund_amount) AS refunded
           FROM advance_refunds r2
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
                   FROM customer_advances a
                  WHERE a.customer_id = c.id), 0::numeric) AS received,
            COALESCE(( SELECT sum(ve.total_amount) AS sum
                   FROM voucher_entries ve
                     JOIN sales s2 ON s2.id = ve.reference_id
                  WHERE s2.customer_id = c.id AND ve.deleted_at IS NULL AND ve.voucher_type = 'receipt'::text AND ve.description ~~* 'Adjusted from advance%'::text), 0::numeric) + COALESCE(( SELECT sum(r.refund_amount) AS sum
                   FROM advance_refunds r
                     JOIN customer_advances a2 ON a2.id = r.advance_id
                  WHERE a2.customer_id = c.id), 0::numeric) AS drawn
           FROM customers c
          WHERE (EXISTS ( SELECT 1
                   FROM customer_advances a3
                  WHERE a3.customer_id = c.id))) t
  WHERE t.drawn > (t.received + 1::numeric);
