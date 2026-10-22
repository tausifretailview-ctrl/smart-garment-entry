-- Reset organization data, in one transaction, scoped to one shop.
--
-- Replaces the table-by-table deletes in the reset-organization edge function, which
-- could stop half way (sales gone, products left) and missed journal entries, customer
-- ledger rows, return allocations, settlement scans and other transaction tables.
--
-- p_mode:
--   'all'          delete everything, including customers and suppliers (old behaviour)
--   'keep_masters' keep Customer Master and Supplier Master rows (plus customer brand
--                  discounts, and students for school shops); delete every bill, payment,
--                  stock, product, employee, size group and log row.
--                  Customer points go back to 0. Opening balances stay as entered unless
--                  p_zero_opening_balances is true, so a kept customer's outstanding
--                  becomes their opening balance.
--
-- Safety:
--   * service role only (EXECUTE revoked from users, and the body refuses user JWTs)
--   * p_performed_by must be an admin of p_organization_id
--   * every DELETE is "WHERE organization_id = shop" or a child row whose parent is in
--     the shop; a shop that has stock transfers with another shop is refused, because
--     those transfer rows also belong to (and feed the stock of) the other shop
--   * before deleting, any ON DELETE CASCADE / SET NULL link from another shop's row to
--     this shop's rows stops the reset with nothing deleted
--   * kept rows of this shop that point at deleted rows (for example teachers.employee_id)
--     get that link set to NULL; per-employee commission rules are deleted
--   * any error rolls back the whole reset

ALTER TABLE public.organization_reset_audit
  ADD COLUMN IF NOT EXISTS reset_mode text;

CREATE OR REPLACE FUNCTION public.reset_organization_data(
  p_organization_id uuid,
  p_performed_by uuid,
  p_confirmation_name text,
  p_mode text DEFAULT 'all',
  p_zero_opening_balances boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keep boolean := (p_mode = 'keep_masters');
  v_started timestamptz := now();
  v_counts jsonb := '{}'::jsonb;
  v_children text[] := ARRAY[
    'sale_items:sale_id:sales',
    'sale_return_items:return_id:sale_returns',
    'purchase_items:bill_id:purchase_bills',
    'purchase_return_items:return_id:purchase_returns',
    'quotation_items:quotation_id:quotations',
    'sale_order_items:order_id:sale_orders',
    'purchase_order_items:order_id:purchase_orders',
    'delivery_challan_items:challan_id:delivery_challans',
    'voucher_items:voucher_id:voucher_entries'
  ];
  v_org_tables text[] := ARRAY[
    'customer_feedback', 'customer_links', 'payment_links',
    'invoice_adjustments', 'sale_return_invoice_allocations', 'customer_ledger_entries',
    'sale_financer_details', 'salesman_commissions', 'daily_salesman_incentive_days',
    'advance_booking_attempts', 'balance_reconciliation_log',
    'stock_alerts', 'stock_settlement_zero_items', 'stock_settlement_zero_runs',
    'stock_settlement_scans', 'settlement_drift_log',
    'stock_movements', 'batch_stock', 'delivery_tracking', 'dc_sale_transfers',
    'student_balance_audit', 'student_ledger_entries', 'student_fees',
    'sale_returns', 'purchase_returns', 'sales', 'purchase_bills',
    'quotations', 'sale_orders', 'purchase_orders', 'delivery_challans',
    'voucher_entries', 'journal_entries',
    'credit_notes', 'advance_refunds', 'customer_advances', 'customer_balance_adjustments',
    'customer_product_prices', 'customer_points_history', 'gift_redemptions',
    'website_products', 'product_images', 'product_variants', 'products',
    'legacy_invoices', 'drafts', 'bulk_update_history',
    'daily_tally_snapshot', 'invariant_daily_snapshot', 'drift_detection_runs',
    'whatsapp_messages', 'whatsapp_conversations', 'whatsapp_logs', 'sms_logs',
    'commission_rules', 'size_groups', 'employees', 'ledger_opening_balances'
  ];
  v_master_tables text[] := ARRAY[
    'customer_brand_discounts', 'customers', 'suppliers', 'students'
  ];
  v_targets text[] := '{}';
  v_pending text[] := '{}';
  v_next text[];
  v_item text;
  v_t text;
  v_n bigint;
  v_progress boolean;
  v_last_err text;
  v_blockers text[] := '{}';
  v_found boolean;
  v_org_name text;
  v_org_number integer;
  r record;
BEGIN
  IF COALESCE(auth.role(), 'service_role') <> 'service_role' THEN
    RAISE EXCEPTION 'reset_organization_data can only be called by the server';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('all', 'keep_masters') THEN
    RAISE EXCEPTION 'Unknown reset mode %', p_mode;
  END IF;

  SELECT name, organization_number INTO v_org_name, v_org_number
  FROM organizations WHERE id = p_organization_id;
  IF v_org_name IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;
  IF p_performed_by IS NULL OR NOT public.is_org_admin(p_performed_by, p_organization_id) THEN
    RAISE EXCEPTION 'Only administrators of this organization can reset its data';
  END IF;
  IF p_confirmation_name IS NULL OR lower(trim(p_confirmation_name)) <> lower(trim(v_org_name)) THEN
    RAISE EXCEPTION 'Confirmation name does not match organization name';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('reset_organization_data_' || p_organization_id::text));

  IF NOT v_keep THEN
    v_org_tables := v_org_tables || v_master_tables;
  END IF;

  FOREACH v_item IN ARRAY v_children LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = split_part(v_item, ':', 1)
                 AND column_name = split_part(v_item, ':', 2))
       AND EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = split_part(v_item, ':', 3)
                 AND column_name = 'organization_id') THEN
      v_pending := v_pending || ('child:' || v_item);
      v_targets := v_targets || split_part(v_item, ':', 1);
    END IF;
  END LOOP;

  IF to_regclass('public.stock_transfers') IS NOT NULL THEN
    SELECT string_agg(DISTINCT o.name, ', ') INTO v_last_err
    FROM public.stock_transfers st
    JOIN public.organizations o
      ON o.id = CASE WHEN st.from_organization_id = p_organization_id
                     THEN st.to_organization_id ELSE st.from_organization_id END
    WHERE st.from_organization_id = p_organization_id OR st.to_organization_id = p_organization_id;
    IF v_last_err IS NOT NULL THEN
      RAISE EXCEPTION 'Reset stopped, nothing was deleted: this shop has stock transfers with % . Those transfers also belong to the other shop, so they cannot be deleted from here.',
        v_last_err;
    END IF;
  END IF;

  FOREACH v_t IN ARRAY v_org_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns c
               JOIN information_schema.tables t
                 ON t.table_schema = c.table_schema AND t.table_name = c.table_name
               WHERE c.table_schema = 'public' AND c.table_name = v_t
                 AND c.column_name = 'organization_id' AND t.table_type = 'BASE TABLE') THEN
      v_pending := v_pending || ('org:' || v_t);
      v_targets := v_targets || v_t;
    END IF;
  END LOOP;

  FOR r IN
    SELECT cl.relname AS child_table, ca.attname AS child_col,
           pl.relname AS parent_table, pa.attname AS parent_col
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace cn ON cn.oid = cl.relnamespace AND cn.nspname = 'public'
    JOIN pg_class pl ON pl.oid = con.confrelid
    JOIN pg_namespace pn ON pn.oid = pl.relnamespace AND pn.nspname = 'public'
    JOIN pg_attribute ca ON ca.attrelid = con.conrelid AND ca.attnum = con.conkey[1]
    JOIN pg_attribute pa ON pa.attrelid = con.confrelid AND pa.attnum = con.confkey[1]
    WHERE con.contype = 'f'
      AND cardinality(con.conkey) = 1
      AND con.confdeltype IN ('c', 'n', 'd')
      AND pl.relname = ANY (v_targets)
      AND EXISTS (SELECT 1 FROM pg_attribute x WHERE x.attrelid = con.conrelid
                    AND x.attname = 'organization_id' AND NOT x.attisdropped)
      AND EXISTS (SELECT 1 FROM pg_attribute y WHERE y.attrelid = con.confrelid
                    AND y.attname = 'organization_id' AND NOT y.attisdropped)
  LOOP
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM public.%I c JOIN public.%I p ON p.%I = c.%I
                      WHERE p.organization_id = $1 AND c.organization_id <> $1)',
      r.child_table, r.parent_table, r.parent_col, r.child_col
    ) INTO v_found USING p_organization_id;
    IF v_found THEN
      v_blockers := v_blockers || format('%s.%s -> %s', r.child_table, r.child_col, r.parent_table);
    END IF;
  END LOOP;

  IF cardinality(v_blockers) > 0 THEN
    RAISE EXCEPTION 'Reset stopped, nothing was deleted: another shop has rows linked to this shop (%)',
      array_to_string(v_blockers, ', ');
  END IF;

  FOR r IN
    SELECT cl.relname AS child_table, ca.attname AS child_col,
           pl.relname AS parent_table, pa.attname AS parent_col
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace cn ON cn.oid = cl.relnamespace AND cn.nspname = 'public'
    JOIN pg_class pl ON pl.oid = con.confrelid
    JOIN pg_namespace pn ON pn.oid = pl.relnamespace AND pn.nspname = 'public'
    JOIN pg_attribute ca ON ca.attrelid = con.conrelid AND ca.attnum = con.conkey[1]
    JOIN pg_attribute pa ON pa.attrelid = con.confrelid AND pa.attnum = con.confkey[1]
    WHERE con.contype = 'f'
      AND cardinality(con.conkey) = 1
      AND con.confdeltype IN ('a', 'r')
      AND NOT ca.attnotnull
      AND pl.relname = ANY (v_targets)
      AND NOT (cl.relname = ANY (v_targets))
      AND EXISTS (SELECT 1 FROM pg_attribute x WHERE x.attrelid = con.conrelid
                    AND x.attname = 'organization_id' AND NOT x.attisdropped)
      AND EXISTS (SELECT 1 FROM pg_attribute y WHERE y.attrelid = con.confrelid
                    AND y.attname = 'organization_id' AND NOT y.attisdropped)
  LOOP
    EXECUTE format(
      'WITH u AS (UPDATE public.%I c SET %I = NULL FROM public.%I p
                  WHERE p.%I = c.%I AND p.organization_id = $1 AND c.organization_id = $1
                  RETURNING 1) SELECT count(*) FROM u',
      r.child_table, r.child_col, r.parent_table, r.parent_col, r.child_col
    ) INTO v_n USING p_organization_id;
    IF v_n > 0 THEN
      v_counts := v_counts || jsonb_build_object('unlinked:' || r.child_table || '.' || r.child_col, v_n);
    END IF;
  END LOOP;

  LOOP
    v_next := '{}';
    v_progress := false;
    FOREACH v_item IN ARRAY v_pending LOOP
      BEGIN
        IF v_item LIKE 'child:%' THEN
          v_t := split_part(v_item, ':', 2);
          EXECUTE format(
            'WITH d AS (DELETE FROM public.%I WHERE %I IN (SELECT id FROM public.%I WHERE organization_id = $1) RETURNING 1)
             SELECT count(*) FROM d',
            v_t, split_part(v_item, ':', 3), split_part(v_item, ':', 4)
          ) INTO v_n USING p_organization_id;
        ELSE
          v_t := substr(v_item, 5);
          EXECUTE format(
            'WITH d AS (DELETE FROM public.%I WHERE organization_id = $1 RETURNING 1) SELECT count(*) FROM d',
            v_t
          ) INTO v_n USING p_organization_id;
        END IF;
        v_counts := v_counts || jsonb_build_object(v_t, COALESCE((v_counts->>v_t)::bigint, 0) + v_n);
        v_progress := true;
      EXCEPTION WHEN foreign_key_violation THEN
        v_next := v_next || v_item;
        v_last_err := v_t || ': ' || SQLERRM;
      END;
    END LOOP;
    EXIT WHEN cardinality(v_next) = 0;
    IF NOT v_progress THEN
      RAISE EXCEPTION 'Reset stopped, nothing was deleted. %', v_last_err;
    END IF;
    v_pending := v_next;
  END LOOP;

  IF v_keep THEN
    UPDATE public.customers
    SET points_balance = 0, points_redeemed = 0, total_points_earned = 0,
        opening_balance = CASE WHEN p_zero_opening_balances THEN 0 ELSE opening_balance END
    WHERE organization_id = p_organization_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('customers_kept', v_n);

    IF p_zero_opening_balances THEN
      UPDATE public.suppliers SET opening_balance = 0
      WHERE organization_id = p_organization_id;
    END IF;
    SELECT count(*) INTO v_n FROM public.suppliers WHERE organization_id = p_organization_id;
    v_counts := v_counts || jsonb_build_object('suppliers_kept', v_n);
  END IF;

  FOREACH v_t IN ARRAY ARRAY['bill_number_sequence', 'bill_number_sequences', 'sale_number_sequence', 'fee_receipt_sequence'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = v_t AND column_name = 'organization_id') THEN
      EXECUTE format(
        'WITH d AS (DELETE FROM public.%I WHERE organization_id = $1 RETURNING 1) SELECT count(*) FROM d',
        v_t
      ) INTO v_n USING p_organization_id;
      v_counts := v_counts || jsonb_build_object(v_t, v_n);
    END IF;
  END LOOP;

  INSERT INTO public.barcode_sequence (organization_id, next_barcode, updated_at)
  VALUES (p_organization_id, (COALESCE(v_org_number, 1)::bigint * 10000000) + 1001, now())
  ON CONFLICT (organization_id)
  DO UPDATE SET next_barcode = EXCLUDED.next_barcode, updated_at = now();

  DELETE FROM public.audit_logs
  WHERE organization_id = p_organization_id AND created_at >= v_started;

  INSERT INTO public.organization_reset_audit
    (organization_id, performed_by, confirmation_name, tables_cleared, errors, reset_mode)
  VALUES
    (p_organization_id, p_performed_by, trim(p_confirmation_name), v_counts, NULL, p_mode);

  RETURN jsonb_build_object(
    'success', true,
    'mode', p_mode,
    'deletedCounts', v_counts,
    'barcodeResetTo', (COALESCE(v_org_number, 1)::bigint * 10000000) + 1001
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_organization_data(uuid, uuid, text, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_organization_data(uuid, uuid, text, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_organization_data(uuid, uuid, text, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reset_organization_data(uuid, uuid, text, text, boolean) TO service_role;
