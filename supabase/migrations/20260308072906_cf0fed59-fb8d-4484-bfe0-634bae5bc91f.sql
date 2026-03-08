-- Fix security definer view: recreate with SECURITY INVOKER
CREATE OR REPLACE VIEW public.sales_with_customer
WITH (security_invoker = true)
AS
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