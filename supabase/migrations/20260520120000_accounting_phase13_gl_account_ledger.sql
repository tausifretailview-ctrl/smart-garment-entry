-- Phase 13: Per-account GL ledger (opening + period movements + running balance).

CREATE OR REPLACE FUNCTION public.get_gl_account_ledger(
  p_org_id uuid,
  p_account_id uuid,
  p_from_date date,
  p_to_date date
)
RETURNS TABLE (
  line_seq bigint,
  entry_date date,
  created_at timestamptz,
  journal_entry_id uuid,
  journal_line_id uuid,
  reference_type text,
  reference_id uuid,
  description text,
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
  v_acct_type text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_org_id IS NULL OR NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_to_date < p_from_date THEN
    RAISE EXCEPTION 'p_to_date must be >= p_from_date' USING ERRCODE = '22023';
  END IF;

  SELECT ca.account_type INTO v_acct_type
  FROM public.chart_of_accounts ca
  WHERE ca.id = p_account_id
    AND ca.organization_id = p_org_id;

  IF v_acct_type IS NULL THEN
    RAISE EXCEPTION 'account not found' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH opening AS (
    SELECT COALESCE(
      SUM(
        CASE
          WHEN v_acct_type IN ('Asset', 'Expense') THEN jl.debit_amount - jl.credit_amount
          ELSE jl.credit_amount - jl.debit_amount
        END
      ),
      0
    )::numeric(14, 2) AS bal
    FROM public.journal_lines jl
    INNER JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.account_id = p_account_id
      AND je.organization_id = p_org_id
      AND je.date < p_from_date
  ),
  mov AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY je.date, je.created_at, jl.id)::bigint AS ord,
      je.date AS entry_date,
      je.created_at,
      je.id AS journal_entry_id,
      jl.id AS journal_line_id,
      je.reference_type,
      je.reference_id,
      COALESCE(je.description, '')::text AS description,
      jl.debit_amount,
      jl.credit_amount,
      (
        CASE
          WHEN v_acct_type IN ('Asset', 'Expense') THEN jl.debit_amount - jl.credit_amount
          ELSE jl.credit_amount - jl.debit_amount
        END
      )::numeric(14, 2) AS signed_amt
    FROM public.journal_lines jl
    INNER JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.account_id = p_account_id
      AND je.organization_id = p_org_id
      AND je.date >= p_from_date
      AND je.date <= p_to_date
  ),
  unioned AS (
    SELECT
      0::bigint AS ord,
      p_from_date AS entry_date,
      NULL::timestamptz AS created_at,
      NULL::uuid AS journal_entry_id,
      NULL::uuid AS journal_line_id,
      '_opening'::text AS reference_type,
      NULL::uuid AS reference_id,
      'Brought forward'::text AS description,
      0::numeric(14, 2) AS debit_amount,
      0::numeric(14, 2) AS credit_amount,
      (SELECT bal FROM opening)::numeric(14, 2) AS signed_amt
    WHERE (SELECT bal FROM opening) <> 0

    UNION ALL

    SELECT
      m.ord,
      m.entry_date,
      m.created_at,
      m.journal_entry_id,
      m.journal_line_id,
      m.reference_type,
      m.reference_id,
      m.description,
      m.debit_amount,
      m.credit_amount,
      m.signed_amt
    FROM mov m
  ),
  with_running AS (
    SELECT
      ROW_NUMBER() OVER (
        ORDER BY u.ord, u.entry_date, u.created_at NULLS LAST, u.journal_line_id NULLS LAST
      )::bigint AS line_seq,
      u.entry_date,
      u.created_at,
      u.journal_entry_id,
      u.journal_line_id,
      u.reference_type,
      u.reference_id,
      u.description,
      u.debit_amount,
      u.credit_amount,
      SUM(u.signed_amt) OVER (
        ORDER BY u.ord, u.entry_date, u.created_at NULLS LAST, u.journal_line_id NULLS LAST
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      )::numeric(14, 2) AS running_balance
    FROM unioned u
  )
  SELECT
    wr.line_seq,
    wr.entry_date,
    wr.created_at,
    wr.journal_entry_id,
    wr.journal_line_id,
    wr.reference_type,
    wr.reference_id,
    wr.description,
    wr.debit_amount,
    wr.credit_amount,
    wr.running_balance
  FROM with_running wr
  ORDER BY wr.line_seq;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_gl_account_ledger(uuid, uuid, date, date) TO authenticated;
