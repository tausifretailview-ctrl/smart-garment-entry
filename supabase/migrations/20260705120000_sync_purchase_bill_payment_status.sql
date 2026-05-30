-- Align purchase_bills.payment_status with paid_amount (incl. CN adjust on bill).

UPDATE public.purchase_bills pb
SET payment_status = CASE
  WHEN COALESCE(pb.is_cancelled, false) = true THEN COALESCE(pb.payment_status, 'cancelled')
  WHEN COALESCE(pb.paid_amount, 0) >= COALESCE(pb.net_amount, 0) - 1
       AND COALESCE(pb.net_amount, 0) > 0 THEN 'paid'
  WHEN COALESCE(pb.paid_amount, 0) > 0.01 THEN 'partial'
  WHEN COALESCE(pb.payment_status, '') IN ('paid', 'partial') THEN pb.payment_status
  ELSE COALESCE(NULLIF(trim(pb.payment_status), ''), 'unpaid')
END
WHERE pb.deleted_at IS NULL
  AND COALESCE(pb.is_cancelled, false) = false;
