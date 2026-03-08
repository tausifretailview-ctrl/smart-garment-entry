CREATE OR REPLACE VIEW public.sales_with_customer AS
SELECT
  s.*,
  COALESCE(c.customer_name, s.customer_name) AS resolved_customer_name,
  COALESCE(c.phone, s.customer_phone)        AS resolved_phone,
  COALESCE(c.email, s.customer_email)        AS resolved_email,
  COALESCE(c.address, s.customer_address)    AS resolved_address,
  c.gst_number                               AS customer_gst_number,
  c.points_balance                           AS customer_loyalty_points
FROM public.sales s
LEFT JOIN public.customers c ON s.customer_id = c.id;

-- Grant access
GRANT SELECT ON public.sales_with_customer TO authenticated;

-- Add a constraint so walk-in sales always have at least a name
ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS chk_sales_customer_identity;
ALTER TABLE public.sales
  ADD CONSTRAINT chk_sales_customer_identity
  CHECK (customer_id IS NOT NULL OR customer_name IS NOT NULL);