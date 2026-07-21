-- Repair: dua1@gmail.com on DUA BY SALEEM'S was created as POS in UI but
-- user_permissions was never written (platform-admin client upsert blocked by RLS).
-- Null permissions = full menu access. Apply Saleem-style POS-only preset.

DO $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_perm jsonb := '{
    "menu": {
      "pos_sales": true,
      "daily_tally": false,
      "gst_reports": false,
      "recycle_bin": false,
      "sale_return": true,
      "user_rights": false,
      "gst_register": false,
      "stock_ageing": false,
      "stock_report": false,
      "tally_export": false,
      "pos_dashboard": false,
      "price_history": false,
      "product_entry": false,
      "purchase_bill": false,
      "sale_analysis": false,
      "sales_invoice": false,
      "settings_view": true,
      "whatsapp_logs": true,
      "dashboard_view": false,
      "main_dashboard": false,
      "stock_analysis": false,
      "whatsapp_inbox": true,
      "customer_ledger": false,
      "customer_master": false,
      "delivery_update": false,
      "einvoice_report": false,
      "employee_master": false,
      "item_wise_sales": false,
      "item_wise_stock": false,
      "purchase_return": false,
      "quotation_entry": false,
      "sales_analytics": false,
      "supplier_master": false,
      "barcode_printing": false,
      "product_tracking": false,
      "sale_order_entry": false,
      "stock_adjustment": false,
      "delivery_whatsapp": false,
      "payment_recording": false,
      "product_dashboard": false,
      "accounts_dashboard": false,
      "delivery_dashboard": false,
      "payments_dashboard": false,
      "purchase_dashboard": false,
      "dashboard_customize": false,
      "net_profit_analysis": false,
      "quotation_dashboard": false,
      "daily_cashier_report": false,
      "purchase_order_entry": false,
      "sale_order_dashboard": false,
      "customer_audit_report": false,
      "hourly_sales_analysis": false,
      "sale_return_dashboard": true,
      "sales_report_customer": false,
      "accounting_reports_view": false,
      "sales_invoice_dashboard": false,
      "purchase_order_dashboard": false,
      "purchase_report_supplier": false,
      "customer_balance_activity": false,
      "purchase_return_dashboard": false,
      "customer_account_statement": false
    },
    "columns": {
      "purchase_bill.mrp": false,
      "sales_invoice.box": false,
      "sales_invoice.hsn": false,
      "sales_invoice.mrp": false
    },
    "special": {
      "ai_chatbot": true,
      "audit_logs": false,
      "export_data": false,
      "whatsapp_send": true,
      "cancel_invoice": false,
      "delete_records": false,
      "modify_records": false,
      "detail_accounting": false,
      "view_gross_profit": false
    },
    "mainMenu": {
      "sales": true,
      "master": false,
      "reports": false,
      "accounts": false,
      "delivery": false,
      "settings": true,
      "dashboard": false,
      "inventory": false
    }
  }'::jsonb;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = 'dua1@gmail.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'dua1@gmail.com not found in auth.users — skipping POS preset repair';
    RETURN;
  END IF;

  SELECT o.id INTO v_org_id
  FROM public.organizations o
  WHERE o.name ILIKE '%DUA BY SALEEM%'
     OR o.slug ILIKE '%dua-by-saleem%'
  ORDER BY o.organization_number NULLS LAST
  LIMIT 1;

  IF v_org_id IS NULL THEN
    -- Fall back to the org where this user is already a member
    SELECT om.organization_id INTO v_org_id
    FROM public.organization_members om
    WHERE om.user_id = v_user_id
    LIMIT 1;
  END IF;

  IF v_org_id IS NULL THEN
    RAISE NOTICE 'No organization found for dua1 — skipping POS preset repair';
    RETURN;
  END IF;

  UPDATE public.organization_members
  SET role = 'user'
  WHERE user_id = v_user_id
    AND organization_id = v_org_id
    AND role IS DISTINCT FROM 'user';

  INSERT INTO public.user_permissions (organization_id, user_id, permissions)
  VALUES (v_org_id, v_user_id, v_perm)
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET
    permissions = EXCLUDED.permissions,
    updated_at = now();

  RAISE NOTICE 'Applied POS-only permissions for dua1 (%) on org %', v_user_id, v_org_id;
END $$;
