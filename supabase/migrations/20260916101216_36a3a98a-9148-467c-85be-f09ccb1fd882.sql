-- cancel_trendzo_empty_pos_bills_20260916
UPDATE public.sales s
SET deleted_at = now(),
    is_cancelled = true,
    cancelled_at = now(),
    cancelled_reason = 'Empty bill: line items never saved (POS save failure 16-09-2026)',
    payment_status = 'cancelled'
WHERE s.organization_id = '28db4eee-c1f0-412e-8e4b-3570656924ef'
  AND s.sale_type = 'pos'
  AND s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
  AND COALESCE(s.net_amount, 0) > 0
  AND s.sale_number IN ('POS/26-27/3061','POS/26-27/3062','POS/26-27/3063','POS/26-27/3064','POS/26-27/3065','POS/26-27/3066','POS/26-27/3067')
  AND NOT EXISTS (SELECT 1 FROM public.sale_items si WHERE si.sale_id = s.id);