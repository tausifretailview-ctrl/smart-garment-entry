UPDATE public.sales
SET paid_amount = 4313, payment_status = 'completed'
WHERE id = 'ab6e2aab-3147-4365-8357-f208872d576b'
RETURNING id, sale_number, paid_amount, payment_status;