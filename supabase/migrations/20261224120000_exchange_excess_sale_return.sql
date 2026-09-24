-- Parent sale_returns row for a POS credit note that has no return of its own
-- (Mix "Issue C/Note" and auto-CN on a negative bill). Members can insert
-- credit_notes but not sale_returns, so the parent is created here.
--
-- linked_sale_id stays NULL. The issuing sale already holds the applied
-- portion in sale_return_adjust; linking this excess row would mark it absorbed.

CREATE OR REPLACE FUNCTION public.create_exchange_excess_sale_return(
  p_credit_note_id uuid,
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cn public.credit_notes%ROWTYPE;
  v_sale_number text;
  v_remaining numeric;
  v_return_number text;
  v_existing uuid;
  v_id uuid;
BEGIN
  IF auth.role() = 'anon'
     OR (
       auth.role() = 'authenticated'
       AND NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
     )
  THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cn
  FROM public.credit_notes
  WHERE id = p_credit_note_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit note not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_cn.sale_id IS NULL THEN
    RAISE EXCEPTION 'Credit note is not tied to a sale' USING ERRCODE = '22023';
  END IF;

  SELECT sr.id INTO v_existing
  FROM public.sale_returns sr
  WHERE sr.credit_note_id = v_cn.id
    AND sr.organization_id = p_organization_id
    AND sr.deleted_at IS NULL
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_remaining := round((COALESCE(v_cn.credit_amount, 0) - COALESCE(v_cn.used_amount, 0))::numeric, 2);
  IF v_remaining <= 0.005 THEN
    RETURN NULL;
  END IF;

  SELECT s.sale_number INTO v_sale_number
  FROM public.sales s
  WHERE s.id = v_cn.sale_id
    AND s.organization_id = p_organization_id;

  v_return_number := public.generate_sale_return_number(p_organization_id);

  INSERT INTO public.sale_returns (
    organization_id,
    customer_id,
    customer_name,
    return_date,
    return_number,
    gross_amount,
    gst_amount,
    net_amount,
    credit_available_balance,
    credit_status,
    credit_note_id,
    refund_type,
    linked_sale_id,
    original_sale_number,
    notes
  ) VALUES (
    p_organization_id,
    v_cn.customer_id,
    COALESCE(NULLIF(btrim(v_cn.customer_name), ''), 'Walk-in Customer'),
    COALESCE(v_cn.issue_date::date, CURRENT_DATE),
    v_return_number,
    v_remaining,
    0,
    v_remaining,
    v_remaining,
    'pending',
    v_cn.id,
    'credit_note',
    NULL,
    NULLIF(btrim(COALESCE(v_sale_number, '')), ''),
    trim(both ' ' FROM
      'Exchange excess credit note ' || COALESCE(v_cn.credit_note_number, '') ||
      CASE
        WHEN v_sale_number IS NOT NULL AND btrim(v_sale_number) <> ''
          THEN ' against invoice ' || v_sale_number
        ELSE ''
      END
    )
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_exchange_excess_sale_return(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_exchange_excess_sale_return(uuid, uuid) TO authenticated, service_role;
