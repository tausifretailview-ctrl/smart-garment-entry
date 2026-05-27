-- Phase C: GL reporting RPC extensions (Tally groups, party drill-down, opening balances in trial balance).

DROP FUNCTION IF EXISTS public.get_gl_trial_balance(uuid, date, date);

CREATE OR REPLACE FUNCTION public.get_gl_trial_balance(p_org_id uuid, p_from_date date, p_to_date date)
RETURNS TABLE (
  account_id uuid,
  account_code text,
  account_name text,
  account_type text,
  account_group text,
  movement_debit numeric,
  movement_credit numeric,
  trial_debit numeric,
  trial_credit numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_org_id IS NULL OR NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_to_date < p_from_date THEN
    RAISE EXCEPTION 'p_to_date must be >= p_from_date' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH journal_agg AS (
    SELECT
      ca.id AS aid,
      ca.account_code AS acode,
      ca.account_name AS aname,
      ca.account_type AS atype,
      ca.account_group AS agroup,
      COALESCE(SUM(jl.debit_amount), 0)::numeric(14, 2) AS md,
      COALESCE(SUM(jl.credit_amount), 0)::numeric(14, 2) AS mc
    FROM public.chart_of_accounts ca
    INNER JOIN public.journal_lines jl ON jl.account_id = ca.id
    INNER JOIN public.journal_entries je ON je.id = jl.journal_entry_id
      AND je.organization_id = p_org_id
      AND je.date >= p_from_date
      AND je.date <= p_to_date
    WHERE ca.organization_id = p_org_id
    GROUP BY ca.id, ca.account_code, ca.account_name, ca.account_type, ca.account_group
  ),
  opening_agg AS (
    SELECT
      ca.id AS aid,
      ca.account_code AS acode,
      ca.account_name AS aname,
      ca.account_type AS atype,
      ca.account_group AS agroup,
      COALESCE(SUM(lob.debit_amount), 0)::numeric(14, 2) AS md,
      COALESCE(SUM(lob.credit_amount), 0)::numeric(14, 2) AS mc
    FROM public.ledger_opening_balances lob
    INNER JOIN public.chart_of_accounts ca ON ca.id = lob.account_id
      AND ca.organization_id = p_org_id
    WHERE lob.organization_id = p_org_id
      AND lob.as_of_date >= p_from_date
      AND lob.as_of_date <= p_to_date
    GROUP BY ca.id, ca.account_code, ca.account_name, ca.account_type, ca.account_group
  ),
  combined AS (
    SELECT * FROM journal_agg
    UNION ALL
    SELECT * FROM opening_agg
  ),
  agg AS (
    SELECT
      c.aid,
      c.acode,
      c.aname,
      c.atype,
      c.agroup,
      COALESCE(SUM(c.md), 0)::numeric(14, 2) AS md,
      COALESCE(SUM(c.mc), 0)::numeric(14, 2) AS mc
    FROM combined c
    GROUP BY c.aid, c.acode, c.aname, c.atype, c.agroup
    HAVING COALESCE(SUM(c.md), 0) <> 0 OR COALESCE(SUM(c.mc), 0) <> 0
  )
  SELECT
    agg.aid AS account_id,
    agg.acode AS account_code,
    agg.aname AS account_name,
    agg.atype AS account_type,
    agg.agroup AS account_group,
    agg.md AS movement_debit,
    agg.mc AS movement_credit,
    GREATEST(agg.md - agg.mc, 0::numeric) AS trial_debit,
    GREATEST(agg.mc - agg.md, 0::numeric) AS trial_credit
  FROM agg
  ORDER BY agg.acode;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_gl_trial_balance(uuid, date, date) TO authenticated;

DROP FUNCTION IF EXISTS public.get_gl_account_ledger(uuid, uuid, date, date);

CREATE OR REPLACE FUNCTION public.get_gl_account_ledger(
  p_org_id uuid,
  p_account_id uuid,
  p_from_date date,
  p_to_date date,
  p_party_id uuid DEFAULT NULL
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
  party_type text,
  party_id uuid,
  party_name_snapshot text,
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
      AND (p_party_id IS NULL OR jl.party_id = p_party_id)
  ),
  opening_lob AS (
    SELECT COALESCE(
      SUM(
        CASE
          WHEN v_acct_type IN ('Asset', 'Expense') THEN lob.debit_amount - lob.credit_amount
          ELSE lob.credit_amount - lob.debit_amount
        END
      ),
      0
    )::numeric(14, 2) AS bal
    FROM public.ledger_opening_balances lob
    WHERE lob.organization_id = p_org_id
      AND lob.account_id = p_account_id
      AND lob.as_of_date < p_from_date
      AND p_party_id IS NULL
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
      jl.party_type,
      jl.party_id,
      jl.party_name_snapshot,
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
      AND (p_party_id IS NULL OR jl.party_id = p_party_id)
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
      NULL::text AS party_type,
      NULL::uuid AS party_id,
      NULL::text AS party_name_snapshot,
      0::numeric(14, 2) AS debit_amount,
      0::numeric(14, 2) AS credit_amount,
      ((SELECT bal FROM opening) + (SELECT bal FROM opening_lob))::numeric(14, 2) AS signed_amt
    WHERE ((SELECT bal FROM opening) + (SELECT bal FROM opening_lob)) <> 0

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
      m.party_type,
      m.party_id,
      m.party_name_snapshot,
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
      u.party_type,
      u.party_id,
      u.party_name_snapshot,
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
    wr.party_type,
    wr.party_id,
    wr.party_name_snapshot,
    wr.debit_amount,
    wr.credit_amount,
    wr.running_balance
  FROM with_running wr
  ORDER BY wr.line_seq;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_gl_account_ledger(uuid, uuid, date, date, uuid) TO authenticated;
