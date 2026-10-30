-- Accounting Phase 2 (accounting audit 30 Oct 2026: H5, H6, L1, M4, M6).
--
-- 1. Customer and supplier opening balances, customer balance adjustments, opening stock,
--    stock adjustments and shop-to-shop transfers now post to the ledger (stock at the
--    product purchase price, same as the Stock Report).
-- 2. Only one live journal per document (duplicate guard).
-- 3. Books-closed lock also stops deleting journals in the closed period (non-admins).
--
-- The automatic postings in (1) run only for shops switched on with
--   SELECT public.gl_enable_auto_postings('<organization id>');
-- which also posts the shop's existing openings, adjustments and stock history once.
-- Running it again re-syncs those postings. Switch on DEMO first.

-- ---------------------------------------------------------------------------
-- New journal reference types
-- ---------------------------------------------------------------------------
ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_reference_type_check;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_reference_type_check
  CHECK (reference_type IN (
    'Sale',
    'Purchase',
    'Payment',
    'StudentFeeReceipt',
    'StudentFeeBalanceAdjustment',
    'ExpenseVoucher',
    'SalaryVoucher',
    'CustomerReceipt',
    'SupplierPayment',
    'CustomerAdvanceApplication',
    'CustomerCreditNoteApplication',
    'CustomerAdvanceReceipt',
    'CustomerAdvanceRefund',
    'SaleReturn',
    'PurchaseReturn',
    'ManualJournal',
    'ThirdPartyVoucher',
    'Contra',
    'RoundOff',
    'PartyOpening',
    'StockAdjustment',
    'BalanceAdjustment'
  ));

-- ---------------------------------------------------------------------------
-- Shops with automatic opening / stock / adjustment postings switched on
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gl_auto_posting_orgs (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  enabled_by uuid
);

COMMENT ON TABLE public.gl_auto_posting_orgs IS
  'Shops whose opening balances, balance adjustments and stock adjustments post to the ledger automatically (gl_enable_auto_postings).';

ALTER TABLE public.gl_auto_posting_orgs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view gl auto posting" ON public.gl_auto_posting_orgs;
CREATE POLICY "Org members can view gl auto posting"
ON public.gl_auto_posting_orgs FOR SELECT
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- ---------------------------------------------------------------------------
-- Helpers (internal: called by the triggers below and by gl_enable_auto_postings)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gl_auto_posting_on(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p_org IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.gl_auto_posting_orgs g WHERE g.organization_id = p_org)
    AND COALESCE(
      (SELECT s.accounting_engine_enabled FROM public.settings s WHERE s.organization_id = p_org LIMIT 1),
      true
    );
$$;

-- Ledger by code, created when missing (same codes and names as the app's seeded accounts).
CREATE OR REPLACE FUNCTION public.gl_ensure_account(
  p_org uuid,
  p_code text,
  p_name text,
  p_type text,
  p_group text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.chart_of_accounts
  WHERE organization_id = p_org AND account_code = p_code
  ORDER BY created_at
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  BEGIN
    INSERT INTO public.chart_of_accounts
      (organization_id, account_code, account_name, account_type, account_group, is_system_account)
    VALUES (p_org, p_code, p_name, p_type, p_group, true)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_id
    FROM public.chart_of_accounts
    WHERE organization_id = p_org AND account_code = p_code
    LIMIT 1;
    IF v_id IS NULL THEN
      -- Name already used by another ledger: keep the code, add it to the name.
      INSERT INTO public.chart_of_accounts
        (organization_id, account_code, account_name, account_type, account_group, is_system_account)
      VALUES (p_org, p_code, p_name || ' (' || p_code || ')', p_type, p_group, true)
      RETURNING id INTO v_id;
    END IF;
  END;
  RETURN v_id;
END;
$$;

-- Journals dated before the books-closed date are left alone.
CREATE OR REPLACE FUNCTION public.gl_books_closed_before(p_org uuid)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT s.books_closed_before_date FROM public.settings s WHERE s.organization_id = p_org LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- Customer / supplier opening balance: one journal per party, replaced on every change.
--   Customer owes us (OB > 0): Dr Accounts Receivable (party), Cr Opening Balance Difference.
--   We owe the supplier (OB > 0): Dr Opening Balance Difference, Cr Accounts Payable (party).
--   A negative opening balance posts the other way round.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gl_post_party_openings(p_party_type text, p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_party_acct uuid;
  v_obd uuid;
  v_closed date;
  v_n integer;
  v_total integer := 0;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN 0;
  END IF;
  IF p_party_type NOT IN ('customer', 'supplier') THEN
    RAISE EXCEPTION 'gl_post_party_openings: unknown party type %', p_party_type;
  END IF;

  DELETE FROM public.journal_entries je
  WHERE je.reference_type = 'PartyOpening'
    AND je.reference_id = ANY (p_ids);

  FOR v_org IN
    SELECT DISTINCT c.organization_id FROM public.customers c
    WHERE p_party_type = 'customer' AND c.id = ANY (p_ids)
    UNION
    SELECT DISTINCT s.organization_id FROM public.suppliers s
    WHERE p_party_type = 'supplier' AND s.id = ANY (p_ids)
  LOOP
    CONTINUE WHEN NOT public.gl_auto_posting_on(v_org);

    v_party_acct := CASE p_party_type
      WHEN 'customer' THEN public.gl_ensure_account(v_org, '1200', 'Accounts Receivable', 'Asset', 'Sundry Debtors')
      ELSE public.gl_ensure_account(v_org, '2000', 'Accounts Payable', 'Liability', 'Sundry Creditors')
    END;
    v_obd := public.gl_ensure_account(v_org, '3200', 'Opening Balance Difference', 'Equity', 'Capital Account');
    v_closed := public.gl_books_closed_before(v_org);

    WITH src AS (
      SELECT c.id, c.organization_id, round(c.opening_balance::numeric, 2) AS ob,
             c.customer_name AS nm,
             (COALESCE(c.created_at, now()) AT TIME ZONE 'Asia/Kolkata')::date AS d,
             c.opening_balance > 0 AS party_dr
      FROM public.customers c
      WHERE p_party_type = 'customer' AND c.id = ANY (p_ids) AND c.organization_id = v_org
        AND c.deleted_at IS NULL AND abs(COALESCE(c.opening_balance, 0)) >= 0.01
      UNION ALL
      SELECT s.id, s.organization_id, round(s.opening_balance::numeric, 2),
             s.supplier_name,
             (COALESCE(s.created_at, now()) AT TIME ZONE 'Asia/Kolkata')::date,
             s.opening_balance < 0
      FROM public.suppliers s
      WHERE p_party_type = 'supplier' AND s.id = ANY (p_ids) AND s.organization_id = v_org
        AND s.deleted_at IS NULL AND abs(COALESCE(s.opening_balance, 0)) >= 0.01
    ),
    ins AS (
      INSERT INTO public.journal_entries
        (organization_id, date, reference_type, reference_id, description, total_amount)
      SELECT src.organization_id,
             -- An opening balance has no period of its own: keep it out of a closed period.
             GREATEST(src.d, COALESCE(v_closed, src.d)),
             'PartyOpening', src.id,
             left('Opening balance: ' || COALESCE(src.nm, ''), 500),
             abs(src.ob)
      FROM src
      RETURNING id, reference_id
    )
    INSERT INTO public.journal_lines
      (journal_entry_id, account_id, debit_amount, credit_amount, party_type, party_id, party_name_snapshot)
    SELECT ins.id, l.account_id, l.dr, l.cr, l.ptype, l.pid, l.pname
    FROM ins
    JOIN src ON src.id = ins.reference_id
    CROSS JOIN LATERAL (VALUES
      (v_party_acct,
       CASE WHEN src.party_dr THEN abs(src.ob) ELSE 0 END,
       CASE WHEN src.party_dr THEN 0 ELSE abs(src.ob) END,
       p_party_type, src.id, src.nm),
      (v_obd,
       CASE WHEN src.party_dr THEN 0 ELSE abs(src.ob) END,
       CASE WHEN src.party_dr THEN abs(src.ob) ELSE 0 END,
       NULL::text, NULL::uuid, NULL::text)
    ) AS l(account_id, dr, cr, ptype, pid, pname);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n / 2;
  END LOOP;

  RETURN v_total;
END;
$$;

-- ---------------------------------------------------------------------------
-- Customer balance adjustment: one journal per adjustment row.
--   Outstanding up: Dr Receivable / Cr Balance Adjustments; down: the reverse.
--   Advance up: Dr Balance Adjustments / Cr Customer Advances; down: the reverse.
-- The balance_adjustment receipts and advance rows the dialog writes post nothing themselves.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gl_post_balance_adjustment(p_adjustment_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  a record;
  v_name text;
  v_out numeric;
  v_adv numeric;
  v_dr numeric := 0;
  v_cr numeric := 0;
  v_diff numeric;
  v_date date;
  v_je uuid;
  v_ar uuid;
  v_advances uuid;
  v_adj uuid;
BEGIN
  DELETE FROM public.journal_entries
  WHERE reference_type = 'BalanceAdjustment' AND reference_id = p_adjustment_id;

  SELECT * INTO a FROM public.customer_balance_adjustments WHERE id = p_adjustment_id;
  IF NOT FOUND OR NOT public.gl_auto_posting_on(a.organization_id) THEN
    RETURN;
  END IF;

  v_out := round(COALESCE(a.new_outstanding, 0) - COALESCE(a.previous_outstanding, 0), 2);
  v_adv := round(COALESCE(a.advance_difference, 0), 2);
  IF abs(v_out) < 0.01 AND abs(v_adv) < 0.01 THEN
    RETURN;
  END IF;

  SELECT customer_name INTO v_name FROM public.customers WHERE id = a.customer_id;
  v_ar := public.gl_ensure_account(a.organization_id, '1200', 'Accounts Receivable', 'Asset', 'Sundry Debtors');
  v_advances := public.gl_ensure_account(a.organization_id, '2150', 'Customer Advances', 'Liability', 'Current Liabilities');
  v_adj := public.gl_ensure_account(a.organization_id, '6930', 'Balance Adjustments', 'Expense', 'Indirect Expenses');

  v_dr := GREATEST(v_out, 0) + GREATEST(-v_adv, 0);
  v_cr := GREATEST(-v_out, 0) + GREATEST(v_adv, 0);
  v_diff := v_dr - v_cr;
  v_date := COALESCE(a.adjustment_date::date, (a.created_at AT TIME ZONE 'Asia/Kolkata')::date);
  -- A closed period stays as it is: the adjustment lands on the first open day.
  v_date := GREATEST(v_date, COALESCE(public.gl_books_closed_before(a.organization_id), v_date));

  INSERT INTO public.journal_entries
    (organization_id, date, reference_type, reference_id, description, total_amount)
  VALUES (
    a.organization_id, v_date, 'BalanceAdjustment', a.id,
    left('Balance adjustment: ' || COALESCE(v_name, '') || ' | ' || COALESCE(a.reason, ''), 500),
    GREATEST(v_dr, v_cr)
  )
  RETURNING id INTO v_je;

  INSERT INTO public.journal_lines
    (journal_entry_id, account_id, debit_amount, credit_amount, party_type, party_id, party_name_snapshot)
  SELECT v_je, l.account_id, l.dr, l.cr, l.ptype, l.pid, l.pname
  FROM (VALUES
    (v_ar, GREATEST(v_out, 0), GREATEST(-v_out, 0), 'customer', a.customer_id, v_name),
    (v_advances, GREATEST(-v_adv, 0), GREATEST(v_adv, 0), 'customer', a.customer_id, v_name),
    (v_adj, GREATEST(-v_diff, 0), GREATEST(v_diff, 0), NULL::text, NULL::uuid, NULL::text)
  ) AS l(account_id, dr, cr, ptype, pid, pname)
  WHERE l.dr > 0 OR l.cr > 0;
END;
$$;

-- ---------------------------------------------------------------------------
-- Stock: one journal per shop, day and kind, rebuilt from that day's stock movements.
--   opening     Product opening stock (new products, Excel import): Dr/Cr Stock vs Opening Balance Difference
--   adjustment  Stock Adjustment, physical count, stock settlement, closing stock import:
--               Dr/Cr Stock vs Stock Shortage & Excess
--   transfer    Shop-to-shop transfer: Dr/Cr Stock vs Inter-shop Stock Transfers
-- Valued at product_variants.pur_price (same as the Stock Report). Automatic reconciliation
-- rows only correct a drifted stock_qty back to the documents, which the ledger already
-- follows, so they post nothing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gl_stock_movement_kind(p_type text, p_notes text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_type IN ('opening', 'opening_balance') THEN 'opening'
    WHEN p_type IN ('reconciliation', 'adjustment') THEN
      CASE
        WHEN COALESCE(p_notes, '') ILIKE 'Opening stock%' THEN 'opening'
        WHEN COALESCE(p_notes, '') ~* '^(stock reconciliation:|reconciliation:|auto-reconciliation:)' THEN NULL
        ELSE 'adjustment'
      END
    WHEN p_type IN ('transfer_in', 'transfer_out', 'transfer_in_cancel', 'transfer_out_cancel') THEN 'transfer'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.gl_stock_day_ref(p_org uuid, p_day date, p_kind text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT md5('gl-stock:' || p_org::text || ':' || p_day::text || ':' || p_kind)::uuid;
$$;

CREATE INDEX IF NOT EXISTS idx_stock_movements_gl_stock_day
  ON public.stock_movements (organization_id, created_at)
  WHERE movement_type IN (
    'opening', 'opening_balance', 'reconciliation', 'adjustment',
    'transfer_in', 'transfer_out', 'transfer_in_cancel', 'transfer_out_cancel'
  );

CREATE OR REPLACE FUNCTION public.gl_post_stock_day(p_org uuid, p_day date)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_from timestamptz := (p_day::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_to timestamptz := ((p_day + 1)::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_closed date;
  v_stock uuid;
  v_other uuid;
  v_je uuid;
  v_amt numeric;
  v_label text;
  r record;
BEGIN
  IF p_org IS NULL OR p_day IS NULL THEN
    RETURN;
  END IF;
  -- Switched-off shops keep what was posted; closed periods are left alone.
  IF NOT public.gl_auto_posting_on(p_org) THEN
    RETURN;
  END IF;
  v_closed := public.gl_books_closed_before(p_org);
  IF v_closed IS NOT NULL AND p_day < v_closed THEN
    RETURN;
  END IF;

  DELETE FROM public.journal_entries
  WHERE organization_id = p_org
    AND reference_type = 'StockAdjustment'
    AND reference_id IN (
      public.gl_stock_day_ref(p_org, p_day, 'opening'),
      public.gl_stock_day_ref(p_org, p_day, 'adjustment'),
      public.gl_stock_day_ref(p_org, p_day, 'transfer')
    );

  FOR r IN
    SELECT k.kind, round(SUM(sm.quantity * COALESCE(pv.pur_price, 0))::numeric, 2) AS val
    FROM public.stock_movements sm
    JOIN public.product_variants pv ON pv.id = sm.variant_id
    CROSS JOIN LATERAL (SELECT public.gl_stock_movement_kind(sm.movement_type, sm.notes) AS kind) k
    WHERE sm.organization_id = p_org
      AND sm.created_at >= v_from
      AND sm.created_at < v_to
      AND sm.deleted_at IS NULL
      AND sm.movement_type IN (
        'opening', 'opening_balance', 'reconciliation', 'adjustment',
        'transfer_in', 'transfer_out', 'transfer_in_cancel', 'transfer_out_cancel'
      )
      AND k.kind IS NOT NULL
    GROUP BY k.kind
  LOOP
    CONTINUE WHEN abs(r.val) < 0.01;

    v_stock := public.gl_ensure_account(p_org, '1300', 'Stock-in-Hand', 'Asset', 'Stock-in-Hand');
    IF r.kind = 'opening' THEN
      v_other := public.gl_ensure_account(p_org, '3200', 'Opening Balance Difference', 'Equity', 'Capital Account');
      v_label := 'Opening stock';
    ELSIF r.kind = 'adjustment' THEN
      v_other := public.gl_ensure_account(p_org, '5100', 'Stock Shortage & Excess', 'Expense', 'Direct Expenses');
      v_label := 'Stock adjustments';
    ELSE
      v_other := public.gl_ensure_account(p_org, '1500', 'Inter-shop Stock Transfers', 'Asset', 'Branch / Divisions');
      v_label := 'Shop stock transfers';
    END IF;
    v_amt := abs(r.val);

    INSERT INTO public.journal_entries
      (organization_id, date, reference_type, reference_id, description, total_amount)
    VALUES (
      p_org, p_day, 'StockAdjustment', public.gl_stock_day_ref(p_org, p_day, r.kind),
      v_label || ' ' || to_char(p_day, 'DD/MM/YYYY') || ' (at purchase price)',
      v_amt
    )
    RETURNING id INTO v_je;

    -- Stock went up: Dr Stock. Stock went down: Cr Stock.
    INSERT INTO public.journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
    VALUES
      (v_je, v_stock, CASE WHEN r.val > 0 THEN v_amt ELSE 0 END, CASE WHEN r.val > 0 THEN 0 ELSE v_amt END),
      (v_je, v_other, CASE WHEN r.val > 0 THEN 0 ELSE v_amt END, CASE WHEN r.val > 0 THEN v_amt ELSE 0 END);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.gl_auto_posting_on(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gl_ensure_account(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gl_books_closed_before(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gl_post_party_openings(text, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gl_post_balance_adjustment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gl_post_stock_day(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gl_auto_posting_on(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gl_ensure_account(uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gl_books_closed_before(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gl_post_party_openings(text, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.gl_post_balance_adjustment(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gl_post_stock_day(uuid, date) TO service_role;

-- ---------------------------------------------------------------------------
-- Triggers. A ledger error never blocks the save: it is logged as a warning and the
-- next gl_enable_auto_postings run puts it right.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_gl_party_opening_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_type text := CASE TG_TABLE_NAME WHEN 'customers' THEN 'customer' ELSE 'supplier' END;
BEGIN
  SELECT array_agg(n.id) INTO v_ids
  FROM new_rows n
  WHERE abs(COALESCE(n.opening_balance, 0)) >= 0.01
    AND EXISTS (SELECT 1 FROM public.gl_auto_posting_orgs g WHERE g.organization_id = n.organization_id);
  IF v_ids IS NULL THEN
    RETURN NULL;
  END IF;
  BEGIN
    PERFORM public.gl_post_party_openings(v_type, v_ids);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Opening balance not posted to the ledger (%): %', TG_TABLE_NAME, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_gl_party_opening_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.gl_auto_posting_orgs g WHERE g.organization_id = NEW.organization_id) THEN
    RETURN NULL;
  END IF;
  BEGIN
    PERFORM public.gl_post_party_openings(
      CASE TG_TABLE_NAME WHEN 'customers' THEN 'customer' ELSE 'supplier' END,
      ARRAY[NEW.id]
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Opening balance not posted to the ledger (%): %', TG_TABLE_NAME, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_gl_party_opening_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    DELETE FROM public.journal_entries
    WHERE reference_type = 'PartyOpening'
      AND reference_id IN (SELECT o.id FROM old_rows o);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Opening balance journal not removed (%): %', TG_TABLE_NAME, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_gl_opening_insert ON public.customers;
CREATE TRIGGER trg_customers_gl_opening_insert
  AFTER INSERT ON public.customers
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_gl_party_opening_insert();

DROP TRIGGER IF EXISTS trg_customers_gl_opening_update ON public.customers;
CREATE TRIGGER trg_customers_gl_opening_update
  AFTER UPDATE OF opening_balance, deleted_at ON public.customers
  FOR EACH ROW
  WHEN (OLD.opening_balance IS DISTINCT FROM NEW.opening_balance OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION public.trg_gl_party_opening_update();

DROP TRIGGER IF EXISTS trg_customers_gl_opening_delete ON public.customers;
CREATE TRIGGER trg_customers_gl_opening_delete
  AFTER DELETE ON public.customers
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_gl_party_opening_delete();

DROP TRIGGER IF EXISTS trg_suppliers_gl_opening_insert ON public.suppliers;
CREATE TRIGGER trg_suppliers_gl_opening_insert
  AFTER INSERT ON public.suppliers
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_gl_party_opening_insert();

DROP TRIGGER IF EXISTS trg_suppliers_gl_opening_update ON public.suppliers;
CREATE TRIGGER trg_suppliers_gl_opening_update
  AFTER UPDATE OF opening_balance, deleted_at ON public.suppliers
  FOR EACH ROW
  WHEN (OLD.opening_balance IS DISTINCT FROM NEW.opening_balance OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION public.trg_gl_party_opening_update();

DROP TRIGGER IF EXISTS trg_suppliers_gl_opening_delete ON public.suppliers;
CREATE TRIGGER trg_suppliers_gl_opening_delete
  AFTER DELETE ON public.suppliers
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_gl_party_opening_delete();

CREATE OR REPLACE FUNCTION public.trg_gl_balance_adjustment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      DELETE FROM public.journal_entries
      WHERE reference_type = 'BalanceAdjustment' AND reference_id = OLD.id;
    ELSIF EXISTS (SELECT 1 FROM public.gl_auto_posting_orgs g WHERE g.organization_id = NEW.organization_id) THEN
      PERFORM public.gl_post_balance_adjustment(NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Balance adjustment not posted to the ledger: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_balance_adjustments_gl ON public.customer_balance_adjustments;
CREATE TRIGGER trg_customer_balance_adjustments_gl
  AFTER INSERT OR DELETE OR UPDATE OF new_outstanding, previous_outstanding, advance_difference
  ON public.customer_balance_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.trg_gl_balance_adjustment();

-- Stock movements: rebuild the day journal of each shop and day the statement touched.
CREATE OR REPLACE FUNCTION public.trg_gl_stock_movements_statement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOR r IN
      SELECT DISTINCT n.organization_id AS org, (n.created_at AT TIME ZONE 'Asia/Kolkata')::date AS d
      FROM new_rows n
      WHERE public.gl_stock_movement_kind(n.movement_type, n.notes) IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.gl_auto_posting_orgs g WHERE g.organization_id = n.organization_id)
    LOOP
      BEGIN
        PERFORM public.gl_post_stock_day(r.org, r.d);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Stock journal % not posted to the ledger: %', r.d, SQLERRM;
      END;
    END LOOP;
  ELSE
    FOR r IN
      SELECT DISTINCT o.organization_id AS org, (o.created_at AT TIME ZONE 'Asia/Kolkata')::date AS d
      FROM old_rows o
      WHERE public.gl_stock_movement_kind(o.movement_type, o.notes) IS NOT NULL
    LOOP
      BEGIN
        PERFORM public.gl_post_stock_day(r.org, r.d);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Stock journal % not posted to the ledger: %', r.d, SQLERRM;
      END;
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_gl_stock_movements_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.gl_post_stock_day(NEW.organization_id, (NEW.created_at AT TIME ZONE 'Asia/Kolkata')::date);
    IF (OLD.created_at AT TIME ZONE 'Asia/Kolkata')::date IS DISTINCT FROM (NEW.created_at AT TIME ZONE 'Asia/Kolkata')::date THEN
      PERFORM public.gl_post_stock_day(OLD.organization_id, (OLD.created_at AT TIME ZONE 'Asia/Kolkata')::date);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Stock journal not posted to the ledger: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_movements_gl_insert ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_gl_insert
  AFTER INSERT ON public.stock_movements
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_gl_stock_movements_statement();

DROP TRIGGER IF EXISTS trg_stock_movements_gl_delete ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_gl_delete
  AFTER DELETE ON public.stock_movements
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_gl_stock_movements_statement();

DROP TRIGGER IF EXISTS trg_stock_movements_gl_update ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_gl_update
  AFTER UPDATE OF quantity, deleted_at, created_at, notes, movement_type ON public.stock_movements
  FOR EACH ROW
  WHEN (
    (public.gl_stock_movement_kind(NEW.movement_type, NEW.notes) IS NOT NULL
      OR public.gl_stock_movement_kind(OLD.movement_type, OLD.notes) IS NOT NULL)
    AND (OLD.quantity IS DISTINCT FROM NEW.quantity
      OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
      OR OLD.created_at IS DISTINCT FROM NEW.created_at
      OR OLD.notes IS DISTINCT FROM NEW.notes
      OR OLD.movement_type IS DISTINCT FROM NEW.movement_type)
  )
  EXECUTE FUNCTION public.trg_gl_stock_movements_row();

-- ---------------------------------------------------------------------------
-- Switch a shop on (or re-sync it): posts its openings, balance adjustments and stock days.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gl_enable_auto_postings(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_customers integer := 0;
  v_suppliers integer := 0;
  v_adjustments integer := 0;
  v_days integer := 0;
  v_failed integer := 0;
  v_errors text[] := ARRAY[]::text[];
  r record;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization id is required';
  END IF;
  PERFORM public._assert_org_access(p_organization_id);
  IF v_uid IS NOT NULL AND NOT (
    public.has_role(v_uid, 'platform_admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = v_uid
        AND om.organization_id = p_organization_id
        AND om.role = 'admin'::public.app_role
    )
  ) THEN
    RAISE EXCEPTION 'Only the shop admin can switch on automatic ledger postings' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.gl_auto_posting_orgs (organization_id, enabled_by)
  VALUES (p_organization_id, v_uid)
  ON CONFLICT (organization_id) DO NOTHING;

  -- Ledgers for owner equity and the automatic postings.
  PERFORM public.gl_ensure_account(p_organization_id, '3000', 'Capital Account', 'Equity', 'Capital Account');
  PERFORM public.gl_ensure_account(p_organization_id, '3100', 'Owner''s Drawings', 'Equity', 'Capital Account');
  PERFORM public.gl_ensure_account(p_organization_id, '3200', 'Opening Balance Difference', 'Equity', 'Capital Account');
  PERFORM public.gl_ensure_account(p_organization_id, '5100', 'Stock Shortage & Excess', 'Expense', 'Direct Expenses');
  PERFORM public.gl_ensure_account(p_organization_id, '6930', 'Balance Adjustments', 'Expense', 'Indirect Expenses');

  -- Customer and supplier openings.
  BEGIN
    DELETE FROM public.journal_entries
    WHERE organization_id = p_organization_id AND reference_type = 'PartyOpening';
    SELECT array_agg(id) INTO v_ids FROM public.customers
    WHERE organization_id = p_organization_id AND deleted_at IS NULL
      AND abs(COALESCE(opening_balance, 0)) >= 0.01;
    v_customers := public.gl_post_party_openings('customer', COALESCE(v_ids, ARRAY[]::uuid[]));
    SELECT array_agg(id) INTO v_ids FROM public.suppliers
    WHERE organization_id = p_organization_id AND deleted_at IS NULL
      AND abs(COALESCE(opening_balance, 0)) >= 0.01;
    v_suppliers := public.gl_post_party_openings('supplier', COALESCE(v_ids, ARRAY[]::uuid[]));
  EXCEPTION WHEN OTHERS THEN
    v_failed := v_failed + 1;
    v_errors := array_append(v_errors, 'openings: ' || SQLERRM);
  END;

  -- Customer balance adjustments.
  FOR r IN
    SELECT id FROM public.customer_balance_adjustments WHERE organization_id = p_organization_id
  LOOP
    BEGIN
      PERFORM public.gl_post_balance_adjustment(r.id);
      v_adjustments := v_adjustments + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      IF cardinality(v_errors) < 5 THEN
        v_errors := array_append(v_errors, 'adjustment ' || r.id || ': ' || SQLERRM);
      END IF;
    END;
  END LOOP;

  -- Opening stock, stock adjustments and transfers, day by day.
  FOR r IN
    SELECT DISTINCT (sm.created_at AT TIME ZONE 'Asia/Kolkata')::date AS d
    FROM public.stock_movements sm
    WHERE sm.organization_id = p_organization_id
      AND sm.movement_type IN (
        'opening', 'opening_balance', 'reconciliation', 'adjustment',
        'transfer_in', 'transfer_out', 'transfer_in_cancel', 'transfer_out_cancel'
      )
    UNION
    SELECT je.date FROM public.journal_entries je
    WHERE je.organization_id = p_organization_id AND je.reference_type = 'StockAdjustment'
  LOOP
    BEGIN
      PERFORM public.gl_post_stock_day(p_organization_id, r.d);
      v_days := v_days + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      IF cardinality(v_errors) < 5 THEN
        v_errors := array_append(v_errors, 'stock ' || r.d || ': ' || SQLERRM);
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'customer_openings', v_customers,
    'supplier_openings', v_suppliers,
    'balance_adjustments', v_adjustments,
    'stock_days', v_days,
    'failed', v_failed,
    'errors', to_jsonb(v_errors)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.gl_disable_auto_postings(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  PERFORM public._assert_org_access(p_organization_id);
  IF v_uid IS NOT NULL AND NOT (
    public.has_role(v_uid, 'platform_admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = v_uid
        AND om.organization_id = p_organization_id
        AND om.role = 'admin'::public.app_role
    )
  ) THEN
    RAISE EXCEPTION 'Only the shop admin can switch off automatic ledger postings' USING ERRCODE = '42501';
  END IF;
  -- Postings already made stay; new changes stop posting.
  DELETE FROM public.gl_auto_posting_orgs WHERE organization_id = p_organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.gl_enable_auto_postings(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gl_disable_auto_postings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gl_enable_auto_postings(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gl_disable_auto_postings(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- M4: only one live journal per document.
-- A reversed original keeps its row (vouchers are reversed, not erased), so it is flagged
-- and left out of the unique index; a restore can then post a fresh original.
-- ---------------------------------------------------------------------------
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS is_reversed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.journal_entries.is_reversed IS
  'True on an original journal once a reversing journal (reversed_journal_id) points at it.';

UPDATE public.journal_entries o
SET is_reversed = true
WHERE NOT o.is_reversed
  AND EXISTS (SELECT 1 FROM public.journal_entries r WHERE r.reversed_journal_id = o.id);

CREATE OR REPLACE FUNCTION public.trg_journal_entries_mark_reversed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.journal_entries
  SET is_reversed = true
  WHERE id = NEW.reversed_journal_id AND NOT is_reversed;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_entries_mark_reversed ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_mark_reversed
  AFTER INSERT ON public.journal_entries
  FOR EACH ROW
  WHEN (NEW.reversed_journal_id IS NOT NULL)
  EXECUTE FUNCTION public.trg_journal_entries_mark_reversed();

DO $guard$
DECLARE
  v_dupes integer;
BEGIN
  SELECT count(*) INTO v_dupes
  FROM (
    SELECT 1
    FROM public.journal_entries
    WHERE reference_id IS NOT NULL AND reversed_journal_id IS NULL AND NOT is_reversed
    GROUP BY organization_id, reference_type, reference_id
    HAVING count(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE WARNING 'Duplicate-journal guard NOT created: % documents have more than one live journal. Remove the extra journals, then run this block again.', v_dupes;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_one_live_per_ref
      ON public.journal_entries (organization_id, reference_type, reference_id)
      WHERE reference_id IS NOT NULL AND reversed_journal_id IS NULL AND NOT is_reversed;
  END IF;
END;
$guard$;

-- ---------------------------------------------------------------------------
-- M6: the books-closed lock also blocks deleting journals dated in the closed period
-- (shop admins and server-side maintenance excepted, as for new journals).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_journal_delete_not_in_closed_books()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_closed_before date;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT s.books_closed_before_date
  INTO v_closed_before
  FROM public.settings s
  WHERE s.organization_id = OLD.organization_id;

  IF v_closed_before IS NULL OR OLD.date >= v_closed_before THEN
    RETURN OLD;
  END IF;

  IF public.has_role(auth.uid(), 'platform_admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = OLD.organization_id
        AND om.role = 'admin'::public.app_role
    ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Accounting period closed: cannot change journals dated % (books closed before %)',
    OLD.date, v_closed_before
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_entries_block_closed_delete ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_block_closed_delete
  BEFORE DELETE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_journal_delete_not_in_closed_books();
