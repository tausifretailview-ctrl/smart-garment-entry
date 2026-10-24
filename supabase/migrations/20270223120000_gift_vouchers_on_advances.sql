-- Gift vouchers (named, built on customer advances). A voucher is an advance booked in the
-- receiver's name: the advance accounting (Customer Advances 2150) is unchanged. These columns
-- only add the short code typed at POS, the expiry date and a flag for reports.
-- Re-run safe.

ALTER TABLE public.customer_advances
  ADD COLUMN IF NOT EXISTS is_gift_voucher boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voucher_code text,
  ADD COLUMN IF NOT EXISTS voucher_expires_on date,
  ADD COLUMN IF NOT EXISTS voucher_from text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_advances_org_voucher_code
  ON public.customer_advances (organization_id, upper(voucher_code))
  WHERE voucher_code IS NOT NULL;
