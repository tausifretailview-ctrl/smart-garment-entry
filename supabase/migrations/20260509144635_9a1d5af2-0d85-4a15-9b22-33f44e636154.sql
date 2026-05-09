UPDATE public.sales
   SET payment_status = 'cancelled',
       updated_at     = now()
 WHERE is_cancelled = true
   AND COALESCE(payment_status, '') <> 'cancelled'
   AND deleted_at IS NULL;