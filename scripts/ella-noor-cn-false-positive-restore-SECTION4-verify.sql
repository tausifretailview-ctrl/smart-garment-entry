-- SECTION 4 — verify 28-row repair (read-only)

-- A) No false-positive rows left
WITH false_positive_fp AS (
  SELECT ve.voucher_number
  FROM public.voucher_entries ve
  INNER JOIN public.sales s ON s.id = ve.reference_id AND s.organization_id = ve.organization_id AND s.deleted_at IS NULL
  WHERE ve.voucher_type = 'receipt'
    AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
    AND ve.deleted_at IS NOT NULL
    AND COALESCE(s.sale_return_adjust, 0) < 0.5
    AND (
      COALESCE(ve.notes, '') ILIKE '%cn_over_apply_repair%'
      OR COALESCE(ve.notes, '') ILIKE '%phantom_cn_repair%'
      OR COALESCE(ve.notes, '') ILIKE '%phantom credit_note_adjustment%'
      OR COALESCE(ve.description, '') ILIKE '%credit note adjusted%'
    )
    AND ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
)
SELECT COUNT(*) AS remaining_false_positives FROM false_positive_fp;
-- expect 0

-- B) Restored vouchers count
SELECT COUNT(*) AS restored_vouchers
FROM public.voucher_entries ve
WHERE ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND ve.deleted_at IS NULL
  AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
  AND COALESCE(ve.notes, '') ILIKE '%cn_false_positive_restore_20260822%';

-- C) Party balances for all affected customers
SELECT customer_name, signed_balance, direction, net_receivable
FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
WHERE customer_name ILIKE ANY (ARRAY[
  '%AMNA DARVESH%', '%Sharmin Mewara%', '%GULNAZ%', '%MAHENOOR KAS%',
  '%Amrin%', '%Muskan%', '%OSAMA%', '%QURRATUL AIN%', '%Shanawaz Memon%',
  '%Mahi Supariwala%', '%Ruby Bhatia%', '%KHADIJA SHEIKH%', '%SAMEENA MADHIYA%',
  '%FIZA CHAUDHARY%', '%Naeem Mukadam%', '%PRIYANKA YADAV%', '%Nazbin Choudhury%',
  '%Sadiqa Faisal Khan%', '%Sadiya Surat%', '%Arezah Nathani%', '%AYESHA MERCHANT%',
  '%SABINA SAMEER%'
])
ORDER BY customer_name, signed_balance;

-- D) Invoices should show Paid where CN fully applied
SELECT s.sale_number, c.customer_name, s.net_amount, s.paid_amount,
       s.sale_return_adjust, s.payment_status
FROM public.sales s
JOIN public.customers c ON c.id = s.customer_id
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.sale_number IN (
    'INV/26-27/227', 'INV/26-27/397', 'INV/26-27/296', 'INV/26-27/262',
    'INV/25-26/733', 'INV/25-26/1374', 'INV/26-27/341', 'INV/26-27/398',
    'INV/25-26/1361', 'INV/25-26/1526', 'INV/26-27/322', 'INV/25-26/903',
    'INV/26-27/469', 'INV/26-27/119', 'INV/25-26/1413', 'INV/26-27/239',
    'INV/26-27/207', 'INV/25-26/443', 'INV/26-27/310', 'INV/26-27/327',
    'INV/25-26/1224', 'INV/26-27/585', 'INV/25-26/1373', 'INV/25-26/856',
    'INV/25-26/955', 'INV/26-27/529', 'INV/25-26/1194', 'INV/25-26/1229'
  )
ORDER BY c.customer_name, s.sale_number;
