
-- 1. get_sales_summary
CREATE OR REPLACE FUNCTION public.get_sales_summary(p_org_id uuid, p_start_date date, p_end_date date)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_to_json(t) FROM (
    SELECT
      COALESCE(COUNT(*), 0)::bigint AS total_count,
      COALESCE(SUM(net_amount), 0)::numeric AS total_amount,
      COALESCE(SUM(net_amount) FILTER (WHERE payment_status = 'paid'), 0)::numeric AS paid_amount,
      COALESCE(SUM(net_amount) FILTER (WHERE payment_status = 'partial'), 0)::numeric AS partial_amount,
      COALESCE(SUM(net_amount) FILTER (WHERE payment_status = 'pending'), 0)::numeric AS pending_amount,
      COALESCE(COUNT(*) FILTER (WHERE payment_status = 'paid'), 0)::bigint AS paid_count,
      COALESCE(COUNT(*) FILTER (WHERE payment_status = 'partial'), 0)::bigint AS partial_count,
      COALESCE(COUNT(*) FILTER (WHERE payment_status = 'pending'), 0)::bigint AS pending_count
    FROM sales
    WHERE organization_id = p_org_id
      AND deleted_at IS NULL
      AND sale_date >= p_start_date
      AND sale_date <= p_end_date
  ) t;
$$;

-- 2. get_purchase_summary
CREATE OR REPLACE FUNCTION public.get_purchase_summary(p_org_id uuid, p_start_date date, p_end_date date)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_to_json(t) FROM (
    SELECT
      COALESCE(COUNT(*), 0)::bigint AS total_count,
      COALESCE(SUM(net_amount), 0)::numeric AS total_amount,
      COALESCE(SUM(net_amount) FILTER (WHERE payment_status = 'paid'), 0)::numeric AS paid_amount,
      COALESCE(SUM(net_amount) FILTER (WHERE payment_status IN ('unpaid', 'pending')), 0)::numeric AS unpaid_amount,
      COALESCE(SUM(net_amount) FILTER (WHERE payment_status = 'partial'), 0)::numeric AS partial_amount
    FROM purchase_bills
    WHERE organization_id = p_org_id
      AND deleted_at IS NULL
      AND bill_date >= p_start_date
      AND bill_date <= p_end_date
  ) t;
$$;

-- 3. get_outstanding_summary
CREATE OR REPLACE FUNCTION public.get_outstanding_summary(p_org_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_to_json(t) FROM (
    SELECT
      COALESCE(SUM(net_amount), 0)::numeric AS total_receivable,
      COALESCE(SUM(net_amount - COALESCE(paid_amount, 0)), 0)::numeric AS total_outstanding,
      COUNT(DISTINCT customer_id)::bigint AS customer_count
    FROM sales
    WHERE organization_id = p_org_id
      AND deleted_at IS NULL
      AND payment_status IN ('pending', 'partial')
  ) t;
$$;

-- 4. get_quotation_summary
CREATE OR REPLACE FUNCTION public.get_quotation_summary(p_org_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_to_json(t) FROM (
    SELECT
      COALESCE(COUNT(*), 0)::bigint AS total_count,
      COALESCE(SUM(net_amount), 0)::numeric AS total_amount,
      COALESCE(COUNT(*) FILTER (WHERE status = 'draft'), 0)::bigint AS draft_count,
      COALESCE(COUNT(*) FILTER (WHERE status = 'sent'), 0)::bigint AS sent_count,
      COALESCE(COUNT(*) FILTER (WHERE status = 'accepted'), 0)::bigint AS accepted_count
    FROM quotations
    WHERE organization_id = p_org_id
      AND deleted_at IS NULL
  ) t;
$$;
