-- New organizations only: every admin / manager added to an org created on or after
-- 14 Oct 2026 starts with the User Rights copied from the ADEEBAAREEBA shop
-- (org b230c582-4f0b-420f-b18b-bef26c2f5ce8, saved rights as of 14 Oct 2026).
-- Other roles (cashier / POS user) keep today's behaviour (POS preset from create-user
-- / add-existing-user, or whatever is set in User Rights).
--
-- AFTER INSERT trigger on organization_members; inserts a user_permissions row only when
-- the member has none yet (ON CONFLICT DO NOTHING), so a POS preset or a later User Rights
-- save still wins. Existing organizations and members are untouched.

CREATE OR REPLACE FUNCTION public.apply_new_org_default_user_rights()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_perms jsonb;
BEGIN
  IF NEW.organization_id IS NULL OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = NEW.organization_id
      AND o.created_at >= timestamptz '2026-10-14 00:00:00+05:30'
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.role::text = 'admin' THEN
    v_perms := '{"columns":{"sales_invoice.box":false},"mainMenu":{"accounts":true,"dashboard":true,"inventory":true,"master":true,"reports":true,"sales":true,"settings":true},"menu":{"accounting_reports_view":true,"accounts_dashboard":true,"accounts_payments":true,"advance_booking_dashboard":true,"barcode_printing":true,"barcode_printing_settings":true,"bulk_product_update":true,"business_insights":true,"customer_account_statement":true,"customer_audit_report":true,"customer_balance_activity":true,"customer_ledger":true,"customer_master":true,"customer_party_balances":true,"customer_points_report":true,"daily_cashier_report":true,"dashboard_view":true,"employee_master":true,"item_wise_sales":true,"item_wise_stock":true,"main_dashboard":true,"net_profit_analysis":true,"payment_recording":true,"payments_dashboard":true,"pos_dashboard":true,"pos_sales":true,"product_dashboard":true,"profile_view":true,"purchase_bill":true,"purchase_dashboard":true,"purchase_report_supplier":true,"purchase_return":true,"purchase_return_dashboard":true,"recycle_bin":true,"reports_hub":true,"sale_return":true,"sale_return_dashboard":true,"sales_report_customer":true,"settings_view":true,"stock_report":true,"supplier_master":true,"supplier_party_balances":true,"user_rights":true,"whatsapp_inbox":true,"whatsapp_logs":true},"special":{"ai_chatbot":true,"cancel_invoice":true,"delete_records":true,"detail_accounting":true,"edit_paid_invoices":true,"modify_records":true,"pos_edit_unit_price":true,"pos_margin_indicator":true,"view_gross_profit":true,"whatsapp_send":true}}'::jsonb;
  ELSIF NEW.role::text = 'manager' THEN
    v_perms := '{"columns":{},"mainMenu":{"accounts":true,"dashboard":false,"delivery":false,"inventory":true,"master":true,"reports":true,"sales":true,"settings":true},"menu":{"accounting_reports_view":false,"accounts_dashboard":true,"accounts_payments":true,"advance_booking_dashboard":false,"barcode_printing":true,"barcode_printing_settings":true,"business_insights":false,"customer_account_statement":false,"customer_audit_report":false,"customer_balance_activity":false,"customer_ledger":true,"customer_master":true,"customer_party_balances":true,"customer_points_report":false,"daily_cashier_report":true,"daily_tally":true,"dashboard_customize":false,"dashboard_view":false,"delivery_challan_dashboard":false,"delivery_challan_entry":false,"delivery_dashboard":false,"delivery_update":false,"delivery_whatsapp":false,"discount_scheme_dashboard":false,"einvoice_report":false,"employee_master":true,"gst_register":false,"gst_reports":false,"hourly_sales_analysis":false,"item_wise_sales":true,"item_wise_stock":true,"main_dashboard":false,"net_profit_analysis":false,"orphaned_products":true,"payment_recording":true,"payments_dashboard":true,"pos_dashboard":true,"pos_sales":true,"price_history":false,"product_dashboard":true,"product_entry":true,"product_tracking":false,"purchase_bill":true,"purchase_dashboard":true,"purchase_order_dashboard":false,"purchase_order_entry":false,"purchase_report_supplier":true,"purchase_return":true,"purchase_return_dashboard":true,"quotation_dashboard":false,"quotation_entry":false,"recycle_bin":true,"reports_hub":false,"sale_analysis":false,"sale_order_dashboard":false,"sale_order_entry":false,"sale_return":true,"sale_return_dashboard":true,"sales_analytics":false,"sales_invoice":false,"sales_invoice_dashboard":false,"sales_report_customer":true,"settings_view":true,"stock_adjustment":true,"stock_ageing":false,"stock_analysis":false,"stock_report":true,"supplier_master":true,"supplier_party_balances":true,"tally_export":false,"user_rights":true,"website_settings":false,"whatsapp_inbox":true,"whatsapp_logs":true},"special":{"ai_chatbot":true,"audit_logs":false,"cancel_invoice":false,"delete_records":false,"detail_accounting":true,"export_data":true,"modify_records":true,"view_gross_profit":false,"whatsapp_send":true}}'::jsonb;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.user_permissions (organization_id, user_id, permissions, updated_at)
  VALUES (NEW.organization_id, NEW.user_id, v_perms, now())
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_org_default_user_rights ON public.organization_members;
CREATE TRIGGER trg_new_org_default_user_rights
  AFTER INSERT ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.apply_new_org_default_user_rights();

REVOKE ALL ON FUNCTION public.apply_new_org_default_user_rights() FROM PUBLIC, anon, authenticated;
