-- Find duplicate purchase bills: same org + supplier_id + bill_date with matching qty/amount
-- Used by Settings → Reconcile Duplicate Purchase Bills cleanup tool.
CREATE OR REPLACE FUNCTION public.find_duplicate_purchase_bills(p_org_id uuid)
RETURNS TABLE (
  group_key text,
  bill_id uuid,
  software_bill_no text,
  supplier_id uuid,
  supplier_name text,
  supplier_invoice_no text,
  bill_date date,
  total_qty numeric,
  net_amount numeric,
  created_at timestamptz,
  group_size int,
  is_earliest boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH grp AS (
    SELECT
      pb.id,
      pb.software_bill_no,
      pb.supplier_id,
      pb.supplier_name,
      pb.supplier_invoice_no,
      pb.bill_date,
      pb.total_qty,
      pb.net_amount,
      pb.created_at,
      (pb.supplier_id::text || '|' || pb.bill_date::text || '|' || ROUND(COALESCE(pb.net_amount, 0))::text || '|' || ROUND(COALESCE(pb.total_qty, 0), 3)::text) AS gk
    FROM purchase_bills pb
    WHERE pb.organization_id = p_org_id
      AND pb.deleted_at IS NULL
      AND pb.supplier_id IS NOT NULL
      AND COALESCE(pb.net_amount, 0) > 0
  ),
  counts AS (
    SELECT gk, COUNT(*)::int AS sz, MIN(created_at) AS earliest
    FROM grp GROUP BY gk
  )
  SELECT
    grp.gk AS group_key,
    grp.id AS bill_id,
    grp.software_bill_no,
    grp.supplier_id,
    grp.supplier_name,
    grp.supplier_invoice_no,
    grp.bill_date,
    grp.total_qty,
    grp.net_amount,
    grp.created_at,
    counts.sz AS group_size,
    (grp.created_at = counts.earliest) AS is_earliest
  FROM grp
  JOIN counts ON counts.gk = grp.gk
  WHERE counts.sz > 1
  ORDER BY grp.bill_date DESC, grp.gk, grp.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_purchase_bills(uuid) TO authenticated;
