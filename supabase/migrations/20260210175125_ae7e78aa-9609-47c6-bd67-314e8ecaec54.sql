
-- Create a helper function for the reset-organization edge function
-- to delete child table rows via parent join
CREATE OR REPLACE FUNCTION public.delete_child_rows_for_org(
  p_child_table TEXT,
  p_fk_column TEXT,
  p_parent_table TEXT,
  p_organization_id UUID
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  EXECUTE format(
    'WITH deleted AS (
       DELETE FROM %I
       WHERE %I IN (SELECT id FROM %I WHERE organization_id = $1)
       RETURNING 1
     ) SELECT count(*) FROM deleted',
    p_child_table, p_fk_column, p_parent_table
  ) INTO v_count USING p_organization_id;
  RETURN v_count;
END;
$$;
