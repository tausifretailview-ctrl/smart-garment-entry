-- Batch purchase_items.line_number updates (replaces per-row client UPDATE storm).

CREATE OR REPLACE FUNCTION public.update_purchase_line_numbers(
  p_bill_id       uuid,
  p_ids           uuid[],
  p_line_numbers  integer[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  -- Resolve org from the bill and guard membership (fail closed)
  SELECT organization_id INTO v_org
  FROM public.purchase_bills WHERE id = p_bill_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Purchase bill not found' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_org_member(v_org);

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  IF array_length(p_ids, 1) <> array_length(p_line_numbers, 1) THEN
    RAISE EXCEPTION 'ids and line_numbers length mismatch';
  END IF;

  -- Single set-based update, scoped to the bill; only rows whose number changed
  UPDATE public.purchase_items pi
  SET line_number = u.ln
  FROM unnest(p_ids, p_line_numbers) AS u(id, ln)
  WHERE pi.id = u.id
    AND pi.bill_id = p_bill_id
    AND pi.line_number IS DISTINCT FROM u.ln;
END;
$$;

REVOKE ALL ON FUNCTION public.update_purchase_line_numbers(uuid, uuid[], integer[])
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_purchase_line_numbers(uuid, uuid[], integer[])
  TO authenticated, service_role;
