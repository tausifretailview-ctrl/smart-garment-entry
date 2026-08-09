CREATE OR REPLACE VIEW public.v_accounting_invariants
WITH (security_invoker = true) AS
 SELECT 'receipts_exceed_invoice'::text AS check_name,
    s.organization_id,
    s.id AS entity_id,
    s.sale_number AS entity_ref,
    round(sum(ve.total_amount) - s.net_amount - COALESCE(s.sale_return_adjust, 0::numeric), 2) AS detail
   FROM sales s
     JOIN voucher_entries ve ON ve.reference_id = s.id
  WHERE ve.voucher_type = 'receipt' AND ve.deleted_at IS NULL AND s.deleted_at IS NULL AND COALESCE(s.is_cancelled, false) = false AND (COALESCE(s.payment_status, '') <> ALL (ARRAY['cancelled','hold']))
  GROUP BY s.id, s.organization_id, s.sale_number, s.net_amount, s.sale_return_adjust
 HAVING sum(ve.total_amount) > (s.net_amount + COALESCE(s.sale_return_adjust, 0::numeric) + 1)
UNION ALL
 SELECT 'duplicate_voucher_number', ve.organization_id,
    (array_agg(ve.id ORDER BY ve.created_at))[1], ve.voucher_number, count(*)::numeric
   FROM voucher_entries ve
  WHERE ve.deleted_at IS NULL
  GROUP BY ve.organization_id, ve.voucher_number
 HAVING count(*) > 1
UNION ALL
 SELECT 'rapid_duplicate_receipt', a.organization_id, a.id, a.voucher_number, a.total_amount
   FROM voucher_entries a
     JOIN voucher_entries b ON b.organization_id = a.organization_id AND b.reference_id = a.reference_id AND b.total_amount = a.total_amount AND b.id > a.id AND b.created_at <= (a.created_at + interval '5 minutes')
  WHERE a.voucher_type = 'receipt' AND a.deleted_at IS NULL AND b.voucher_type = 'receipt' AND b.deleted_at IS NULL AND a.reference_id IS NOT NULL
UNION ALL
 SELECT 'advance_refund_exceeds_available', a.organization_id, a.id, a.advance_number,
    round(sum(r.refund_amount) - (a.amount - COALESCE(a.used_amount, 0::numeric)), 2)
   FROM customer_advances a JOIN advance_refunds r ON r.advance_id = a.id
  GROUP BY a.id, a.organization_id, a.advance_number, a.amount, a.used_amount
 HAVING sum(r.refund_amount) > (a.amount - COALESCE(a.used_amount, 0::numeric) + 1)
UNION ALL
 SELECT 'advance_refund_exceeds_booking', a.organization_id, a.id, a.advance_number,
    round(sum(r.refund_amount) - a.amount, 2)
   FROM customer_advances a JOIN advance_refunds r ON r.advance_id = a.id
  GROUP BY a.id, a.organization_id, a.advance_number, a.amount
 HAVING sum(r.refund_amount) > (a.amount + 1)
UNION ALL
 SELECT 'advance_applied_exceeds_invoice', s.organization_id, s.id, s.sale_number,
    round(sum(ve.total_amount) - s.net_amount, 2)
   FROM sales s
     JOIN voucher_entries ve ON ve.reference_id = s.id AND ve.voucher_type = 'receipt' AND ve.payment_method = 'advance_adjustment' AND ve.deleted_at IS NULL
  WHERE s.deleted_at IS NULL AND COALESCE(s.is_cancelled, false) = false
  GROUP BY s.id, s.organization_id, s.sale_number, s.net_amount
 HAVING sum(ve.total_amount) > (s.net_amount + 1)
UNION ALL
 SELECT 'paid_exceeds_net', s.organization_id, s.id, s.sale_number,
    round(COALESCE(s.paid_amount, 0::numeric) - (s.net_amount + COALESCE(s.sale_return_adjust, 0::numeric)), 2)
   FROM sales s
  WHERE s.deleted_at IS NULL AND COALESCE(s.is_cancelled, false) = false AND COALESCE(s.paid_amount, 0::numeric) > (s.net_amount + COALESCE(s.sale_return_adjust, 0::numeric) + 1)
UNION ALL
 SELECT 'paid_diverges_from_receipts', s.organization_id, s.id, s.sale_number,
    round(COALESCE(s.paid_amount, 0::numeric) - v.amt, 2)
   FROM sales s
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(ve.total_amount), 0::numeric) AS amt
           FROM voucher_entries ve
          WHERE ve.reference_id = s.id AND ve.voucher_type = 'receipt' AND ve.deleted_at IS NULL) v ON true
  WHERE s.deleted_at IS NULL AND COALESCE(s.is_cancelled, false) = false AND s.legacy_paid_baseline IS NULL AND abs(COALESCE(s.paid_amount, 0::numeric) - v.amt) > 1
UNION ALL
 SELECT 'advance_draw_exceeds_booking', a.organization_id, a.id, a.advance_number,
    round(x.applied + COALESCE(r.refunded, 0) - a.amount, 2)
   FROM customer_advances a
     JOIN LATERAL ( SELECT COALESCE(sum(ve.total_amount), 0::numeric) AS applied
           FROM voucher_entries ve
          WHERE ve.organization_id = a.organization_id AND ve.deleted_at IS NULL
            AND ve.voucher_type = 'receipt'
            AND ve.description LIKE '%(advance ' || a.advance_number || ')%') x ON true
     LEFT JOIN LATERAL ( SELECT sum(r2.refund_amount) AS refunded FROM advance_refunds r2 WHERE r2.advance_id = a.id ) r ON true
  WHERE x.applied + COALESCE(r.refunded, 0) > a.amount + 1
UNION ALL
 SELECT 'customer_advance_pool_negative', t.organization_id, t.customer_id, t.customer_name,
    round(t.drawn - t.received, 2)
   FROM (
     SELECT c.organization_id, c.id AS customer_id, c.customer_name,
       COALESCE(( SELECT sum(a.amount) FROM customer_advances a WHERE a.customer_id = c.id ), 0) AS received,
       COALESCE(( SELECT sum(ve.total_amount) FROM voucher_entries ve
                    JOIN sales s2 ON s2.id = ve.reference_id
                   WHERE s2.customer_id = c.id AND ve.deleted_at IS NULL
                     AND ve.voucher_type = 'receipt'
                     AND ve.description ILIKE 'Adjusted from advance%' ), 0)
       + COALESCE(( SELECT sum(r.refund_amount) FROM advance_refunds r
                      JOIN customer_advances a2 ON a2.id = r.advance_id
                     WHERE a2.customer_id = c.id ), 0) AS drawn
     FROM customers c
     WHERE EXISTS ( SELECT 1 FROM customer_advances a3 WHERE a3.customer_id = c.id )
   ) t
  WHERE t.drawn > t.received + 1;