-- Bank Statement opening balance comes only from Accounts > Opening Balances.
-- The latest opening balance entered for ledger 1010 Bank (as-of date on or before the
-- To date) is the start of the bank book: journal lines dated before it are ignored.
-- With no opening balance entered, the statement starts at 0 on the From date.
-- The amount belongs to the default bank; other banks start at 0 on the same date.

CREATE OR REPLACE FUNCTION public.get_bank_account_statement(
  p_org_id uuid,
  p_bank_account_id uuid,
  p_from_date date,
  p_to_date date
)
RETURNS TABLE (
  line_seq bigint,
  entry_date date,
  created_at timestamptz,
  journal_entry_id uuid,
  reference_type text,
  reference_id uuid,
  description text,
  doc_number text,
  payment_method text,
  party_name text,
  bank_account_id uuid,
  debit_amount numeric,
  credit_amount numeric,
  running_balance numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bank_ledger uuid;
  v_default_bank uuid;
  v_opening numeric(14, 2) := 0;
  v_lob numeric(14, 2) := 0;
  v_anchor date;
  v_start date;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_org_id IS NULL OR NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_to_date < p_from_date THEN
    RAISE EXCEPTION 'p_to_date must be >= p_from_date' USING ERRCODE = '22023';
  END IF;

  SELECT ca.id INTO v_bank_ledger
  FROM public.chart_of_accounts ca
  WHERE ca.organization_id = p_org_id
    AND ca.account_code = '1010'
  LIMIT 1;

  IF v_bank_ledger IS NULL THEN
    RETURN;
  END IF;

  SELECT ob.id INTO v_default_bank
  FROM public.organization_bank_accounts ob
  WHERE ob.organization_id = p_org_id
    AND ob.deleted_at IS NULL
  ORDER BY ob.is_default DESC, ob.created_at ASC
  LIMIT 1;

  SELECT MAX(lob.as_of_date) INTO v_anchor
  FROM public.ledger_opening_balances lob
  WHERE lob.organization_id = p_org_id
    AND lob.account_id = v_bank_ledger
    AND lob.as_of_date <= p_to_date;

  IF v_anchor IS NOT NULL
     AND (p_bank_account_id IS NULL OR p_bank_account_id IS NOT DISTINCT FROM v_default_bank) THEN
    SELECT COALESCE(SUM(lob.debit_amount - lob.credit_amount), 0)
    INTO v_lob
    FROM public.ledger_opening_balances lob
    WHERE lob.organization_id = p_org_id
      AND lob.account_id = v_bank_ledger
      AND lob.as_of_date = v_anchor;
  END IF;

  v_start := GREATEST(p_from_date, COALESCE(v_anchor, p_from_date));

  SELECT COALESCE(SUM(t.debit_amount - t.credit_amount), 0)
  INTO v_opening
  FROM (
    SELECT
      jl.debit_amount,
      jl.credit_amount,
      COALESCE(eb.id, vb.id, v_default_bank) AS bank_id
    FROM public.journal_lines jl
    INNER JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    LEFT JOIN public.voucher_entries ve
      ON ve.id = je.reference_id AND ve.organization_id = p_org_id
    LEFT JOIN public.organization_bank_accounts eb
      ON eb.id = je.bank_account_id AND eb.organization_id = p_org_id AND eb.deleted_at IS NULL
    LEFT JOIN public.organization_bank_accounts vb
      ON vb.id = ve.receiving_bank_account_id AND vb.organization_id = p_org_id AND vb.deleted_at IS NULL
    WHERE jl.account_id = v_bank_ledger
      AND je.organization_id = p_org_id
      AND je.date >= COALESCE(v_anchor, p_from_date)
      AND je.date < v_start
  ) t
  WHERE p_bank_account_id IS NULL OR t.bank_id IS NOT DISTINCT FROM p_bank_account_id;

  RETURN QUERY
  WITH mov AS (
    SELECT
      je.date AS m_date,
      je.created_at AS m_created,
      je.id AS m_entry,
      jl.id AS m_line,
      je.reference_type AS m_ref_type,
      je.reference_id AS m_ref_id,
      COALESCE(je.description, '')::text AS m_desc,
      COALESCE(ve.voucher_number, s.sale_number)::text AS m_doc,
      COALESCE(ve.payment_method, s.payment_method)::text AS m_pm,
      COALESCE(
        jl.party_name_snapshot,
        (
          SELECT x.party_name_snapshot
          FROM public.journal_lines x
          WHERE x.journal_entry_id = je.id
            AND x.party_name_snapshot IS NOT NULL
          LIMIT 1
        ),
        s.customer_name
      )::text AS m_party,
      COALESCE(eb.id, vb.id, v_default_bank) AS m_bank,
      jl.debit_amount AS m_dr,
      jl.credit_amount AS m_cr
    FROM public.journal_lines jl
    INNER JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    LEFT JOIN public.voucher_entries ve
      ON ve.id = je.reference_id AND ve.organization_id = p_org_id
    LEFT JOIN public.sales s
      ON je.reference_type = 'Sale' AND s.id = je.reference_id AND s.organization_id = p_org_id
    LEFT JOIN public.organization_bank_accounts eb
      ON eb.id = je.bank_account_id AND eb.organization_id = p_org_id AND eb.deleted_at IS NULL
    LEFT JOIN public.organization_bank_accounts vb
      ON vb.id = ve.receiving_bank_account_id AND vb.organization_id = p_org_id AND vb.deleted_at IS NULL
    WHERE jl.account_id = v_bank_ledger
      AND je.organization_id = p_org_id
      AND je.date >= v_start
      AND je.date <= p_to_date
  ),
  picked AS (
    SELECT * FROM mov m
    WHERE p_bank_account_id IS NULL OR m.m_bank IS NOT DISTINCT FROM p_bank_account_id
  ),
  unioned AS (
    SELECT
      0::bigint AS ord,
      v_start AS u_date,
      NULL::timestamptz AS u_created,
      NULL::uuid AS u_entry,
      NULL::uuid AS u_line,
      '_opening'::text AS u_ref_type,
      NULL::uuid AS u_ref_id,
      'Opening balance'::text AS u_desc,
      NULL::text AS u_doc,
      NULL::text AS u_pm,
      NULL::text AS u_party,
      p_bank_account_id AS u_bank,
      0::numeric(14, 2) AS u_dr,
      0::numeric(14, 2) AS u_cr,
      (v_opening + v_lob)::numeric(14, 2) AS u_signed

    UNION ALL

    SELECT
      1::bigint,
      p.m_date,
      p.m_created,
      p.m_entry,
      p.m_line,
      p.m_ref_type,
      p.m_ref_id,
      p.m_desc,
      p.m_doc,
      p.m_pm,
      p.m_party,
      p.m_bank,
      p.m_dr,
      p.m_cr,
      (p.m_dr - p.m_cr)::numeric(14, 2)
    FROM picked p
  )
  SELECT
    (ROW_NUMBER() OVER w)::bigint,
    u.u_date,
    u.u_created,
    u.u_entry,
    u.u_ref_type,
    u.u_ref_id,
    u.u_desc,
    u.u_doc,
    u.u_pm,
    u.u_party,
    u.u_bank,
    u.u_dr,
    u.u_cr,
    (SUM(u.u_signed) OVER w)::numeric(14, 2)
  FROM unioned u
  WINDOW w AS (
    ORDER BY u.ord, u.u_date, u.u_created NULLS FIRST, u.u_line NULLS FIRST
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )
  ORDER BY u.ord, u.u_date, u.u_created NULLS FIRST, u.u_line NULLS FIRST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_bank_account_statement(uuid, uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_bank_account_statement(uuid, uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_bank_account_statement(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bank_account_statement(uuid, uuid, date, date) TO service_role;
