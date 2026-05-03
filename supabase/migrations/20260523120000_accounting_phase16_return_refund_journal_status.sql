-- Phase 16: Return refund routing (payment_method), journal_status on returns, 5050 Purchase Returns COA,
-- sync legacy posted state, extend admin_reset_org_gl.

-- 1) Columns on sale_returns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sale_returns' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE public.sale_returns ADD COLUMN payment_method text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sale_returns' AND column_name = 'journal_status'
  ) THEN
    ALTER TABLE public.sale_returns ADD COLUMN journal_status text NOT NULL DEFAULT 'pending';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sale_returns' AND column_name = 'journal_error'
  ) THEN
    ALTER TABLE public.sale_returns ADD COLUMN journal_error text;
  END IF;
END $$;

ALTER TABLE public.sale_returns ALTER COLUMN journal_status SET DEFAULT 'pending';

-- 2) Columns on purchase_returns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_returns' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE public.purchase_returns ADD COLUMN payment_method text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_returns' AND column_name = 'journal_status'
  ) THEN
    ALTER TABLE public.purchase_returns ADD COLUMN journal_status text NOT NULL DEFAULT 'pending';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_returns' AND column_name = 'journal_error'
  ) THEN
    ALTER TABLE public.purchase_returns ADD COLUMN journal_error text;
  END IF;
END $$;

ALTER TABLE public.purchase_returns ALTER COLUMN journal_status SET DEFAULT 'pending';

-- 3) Legacy rows: mark posted when a journal already exists
UPDATE public.sale_returns sr
SET journal_status = 'posted',
    journal_error = NULL
WHERE EXISTS (
  SELECT 1
  FROM public.journal_entries je
  WHERE je.organization_id = sr.organization_id
    AND je.reference_type = 'SaleReturn'
    AND je.reference_id = sr.id
);

UPDATE public.purchase_returns pr
SET journal_status = 'posted',
    journal_error = NULL
WHERE EXISTS (
  SELECT 1
  FROM public.journal_entries je
  WHERE je.organization_id = pr.organization_id
    AND je.reference_type = 'PurchaseReturn'
    AND je.reference_id = pr.id
);

-- 4) Rename 4050 display name; seed 5050 Purchase Returns for every org missing it
UPDATE public.chart_of_accounts
SET account_name = 'Sales Returns & Allowances'
WHERE account_code = '4050'
  AND account_name = 'Sales Returns';

INSERT INTO public.chart_of_accounts (
  organization_id,
  account_code,
  account_name,
  account_type,
  parent_account_id,
  is_system_account
)
SELECT o.id,
       '5050',
       'Purchase Returns',
       'Expense',
       NULL,
       true
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM public.chart_of_accounts c
  WHERE c.organization_id = o.id
    AND c.account_code = '5050'
);

-- 5) admin_reset_org_gl: also reset return journal columns
CREATE OR REPLACE FUNCTION public.admin_reset_org_gl(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted_lines bigint;
  v_deleted_entries bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  IF p_org_id IS NULL OR NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'platform_admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = p_org_id
        AND om.role = 'admin'::public.app_role
    )
  ) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.journal_lines jl
  USING public.journal_entries je
  WHERE jl.journal_entry_id = je.id
    AND je.organization_id = p_org_id;
  GET DIAGNOSTICS v_deleted_lines = ROW_COUNT;

  DELETE FROM public.journal_entries
  WHERE organization_id = p_org_id;
  GET DIAGNOSTICS v_deleted_entries = ROW_COUNT;

  UPDATE public.sales
  SET journal_status = 'pending', journal_error = NULL
  WHERE organization_id = p_org_id;

  UPDATE public.purchase_bills
  SET journal_status = 'pending', journal_error = NULL
  WHERE organization_id = p_org_id;

  UPDATE public.sale_returns
  SET journal_status = 'pending', journal_error = NULL
  WHERE organization_id = p_org_id;

  UPDATE public.purchase_returns
  SET journal_status = 'pending', journal_error = NULL
  WHERE organization_id = p_org_id;

  RETURN jsonb_build_object(
    'ok', true,
    'journal_lines_deleted', v_deleted_lines,
    'journal_entries_deleted', v_deleted_entries
  );
END;
$$;

CREATE INDEX IF NOT EXISTS idx_sale_returns_org_journal_status
  ON public.sale_returns (organization_id, journal_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_returns_org_journal_status
  ON public.purchase_returns (organization_id, journal_status)
  WHERE deleted_at IS NULL;
