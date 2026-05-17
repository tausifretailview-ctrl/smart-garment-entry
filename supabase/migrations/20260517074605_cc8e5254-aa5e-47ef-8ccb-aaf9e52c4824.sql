UPDATE sales 
SET paid_amount = net_amount,
    payment_status = 'completed',
    updated_at = NOW()
WHERE id = '43a44550-8215-43b4-8eb7-a59e5504ab32';