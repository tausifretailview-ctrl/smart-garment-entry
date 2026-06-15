-- Org-wide pure-numeric supplier invoice serial (480 → 481 → 482).
-- Ignores prefixed values (RV*, slashes, etc.) when suggesting the next number.

CREATE OR REPLACE FUNCTION public._next_supplier_invoice_in_series(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  max_num bigint;
BEGIN
  SELECT MAX(supplier_invoice_no::bigint)
  INTO max_num
  FROM purchase_bills
  WHERE organization_id = p_organization_id
    AND deleted_at IS NULL
    AND (is_cancelled IS NULL OR is_cancelled = false)
    AND supplier_invoice_no IS NOT NULL
    AND trim(supplier_invoice_no) <> ''
    AND supplier_invoice_no ~ '^\d+$';

  IF max_num IS NULL THEN
    RETURN '1';
  END IF;

  RETURN (max_num + 1)::text;
END;
$$;
