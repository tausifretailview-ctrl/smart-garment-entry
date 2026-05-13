UPDATE credit_notes cn
SET used_amount = LEAST(cn.credit_amount, sr.net_amount - COALESCE(sr.credit_available_balance, sr.net_amount)),
    status = CASE
      WHEN cn.credit_amount - LEAST(cn.credit_amount, sr.net_amount - COALESCE(sr.credit_available_balance, sr.net_amount)) <= 0.01
        THEN 'fully_used'
      ELSE 'active'
    END,
    updated_at = now()
FROM sale_returns sr
WHERE sr.credit_note_id = cn.id
  AND sr.deleted_at IS NULL
  AND cn.deleted_at IS NULL
  AND cn.used_amount = 0
  AND sr.credit_available_balance IS NOT NULL
  AND sr.credit_available_balance < sr.net_amount - 0.01;