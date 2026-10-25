// DC User permissions preset (25 Oct 2026).
// Applied when an org admin picks the "DC User" role in Settings > Organization (Create User,
// Add Existing User, or a member's role). The login is an org manager (purchases need it) with
// User Rights "DC User (only DC)" on, so lists, dashboards and reports show only DC (No GST)
// purchases, DC stock, DC sale lines and DC returns. Menus are the screens that follow that
// rule; anything else stays off until turned on in User Rights.
import { MENU_FALLBACK_WHEN_UNSET } from "@/lib/menuPermissions";
import { DC_ONLY_RIGHT } from "@/lib/dcVisibility";

/** Org role a DC User is saved with. */
export const DC_USER_ORG_ROLE = "manager" as const;

/** Value used by the role pickers for "DC User". Not a database role. */
export const DC_USER_ROLE_OPTION = "dc_user" as const;

const DC_USER_MENU: Record<string, boolean> = {
  // Newer rights that otherwise follow an older right when unset: keep them off.
  ...Object.fromEntries(Object.keys(MENU_FALLBACK_WHEN_UNSET).map((id) => [id, false])),
  main_dashboard: true,
  dashboard_view: true,
  supplier_master: true,
  product_dashboard: true,
  purchase_bill: true,
  purchase_dashboard: true,
  purchase_return: true,
  purchase_return_dashboard: true,
  stock_report: true,
  barcode_printing: true,
  pos_dashboard: true,
  sales_invoice_dashboard: true,
  sale_return_dashboard: true,
  reports_hub: true,
  stock_analysis: true,
  stock_ageing: true,
  daily_cashier_report: true,
  sale_analysis: true,
  purchase_report_supplier: true,
  item_wise_sales: true,
  item_wise_stock: true,
  product_tracking: true,
  sales_analytics: true,
  net_profit_analysis: true,
  hourly_sales_analysis: true,
  profile_view: true,
};

export const DC_USER_PERMISSIONS_PRESET = {
  menu: DC_USER_MENU,
  mainMenu: {
    dashboard: true,
    master: true,
    inventory: true,
    sales: true,
    reports: true,
    delivery: false,
    accounts: false,
    settings: true,
  },
  special: {
    [DC_ONLY_RIGHT]: true,
    modify_records: true,
    delete_records: false,
    cancel_invoice: false,
    edit_paid_invoices: false,
    whatsapp_send: false,
    detail_accounting: false,
    export_data: true,
    audit_logs: false,
    view_gross_profit: false,
    // The assistant can read every bill, so it stays off for a DC User.
    ai_chatbot: false,
  },
  columns: {},
};

/** True when saved User Rights mark the login as a DC User. */
export function isDcUserPermissions(permissions: unknown): boolean {
  const special = (permissions as { special?: Record<string, unknown> } | null | undefined)?.special;
  return special?.[DC_ONLY_RIGHT] === true;
}
