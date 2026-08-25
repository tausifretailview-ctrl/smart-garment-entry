-- Allow credit_note on sales.payment_method (Sales Invoice Dashboard CN payment recording).
-- UI option added without matching CHECK update; advance was added the same way in 20260212194132.

ALTER TABLE public.sales DROP CONSTRAINT sales_payment_method_check;

ALTER TABLE public.sales ADD CONSTRAINT sales_payment_method_check
  CHECK (payment_method = ANY (ARRAY[
    'cash',
    'card',
    'upi',
    'multiple',
    'pay_later',
    'bank_transfer',
    'cheque',
    'other',
    'advance',
    'credit_note'
  ]));
