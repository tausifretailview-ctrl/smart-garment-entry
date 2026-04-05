
ALTER TABLE public.voucher_entries
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS paid_by TEXT,
  ADD COLUMN IF NOT EXISTS receipt_number TEXT;

CREATE OR REPLACE FUNCTION public.get_expense_by_category(
  p_org_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS JSON
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
  FROM (
    SELECT
      COALESCE(NULLIF(category, ''), NULLIF(description, ''), 'Miscellaneous') AS category,
      SUM(total_amount) AS amount,
      COUNT(*) AS voucher_count
    FROM voucher_entries
    WHERE organization_id = p_org_id
      AND voucher_type = 'expense'
      AND voucher_date >= p_from_date
      AND voucher_date <= p_to_date
      AND deleted_at IS NULL
    GROUP BY COALESCE(NULLIF(category, ''), NULLIF(description, ''), 'Miscellaneous')
    ORDER BY SUM(total_amount) DESC
  ) t;
$$;
