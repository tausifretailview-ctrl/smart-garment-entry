-- Add payment breakdown columns to sales table
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS cash_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS card_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS upi_amount numeric DEFAULT 0;

-- Update existing records to set cash_amount = net_amount for cash payments
UPDATE sales 
SET cash_amount = net_amount 
WHERE payment_method = 'cash' AND cash_amount = 0;

-- Update existing records to set card_amount = net_amount for card payments
UPDATE sales 
SET card_amount = net_amount 
WHERE payment_method = 'card' AND card_amount = 0;

-- Update existing records to set upi_amount = net_amount for UPI payments
UPDATE sales 
SET upi_amount = net_amount 
WHERE payment_method = 'upi' AND upi_amount = 0;

-- Update paid_amount for existing records based on payment_status
UPDATE sales 
SET paid_amount = CASE 
  WHEN payment_status = 'completed' THEN net_amount
  WHEN payment_status = 'pending' THEN 0
  ELSE COALESCE(paid_amount, 0)
END
WHERE paid_amount IS NULL OR paid_amount = 0;