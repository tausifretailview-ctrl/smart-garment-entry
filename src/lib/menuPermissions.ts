const normalizePath = (path: string) => path.replace(/^\/+/, "").replace(/\/+$/, "");

/** Legacy submenu ids from older User Rights saves → canonical ids. */
export const LEGACY_MENU_ID_ALIASES: Record<string, string> = {
  delivery_challan: "delivery_challan_entry",
};

const MENU_PERMISSION_BY_PATH: Record<string, string> = {
  "": "main_dashboard",
  dashboard: "main_dashboard",
  products: "product_dashboard",
  "product-dashboard": "product_dashboard",
  "product-entry": "product_entry",
  "orphaned-products": "orphaned_products",
  customers: "customer_master",
  suppliers: "supplier_master",
  employees: "employee_master",
  "pos-sales": "pos_sales",
  "pos-delivery-challan": "pos_sales",
  "pos-dashboard": "pos_dashboard",
  "sales-invoice": "sales_invoice",
  "sales-invoice-dashboard": "sales_invoice_dashboard",
  "quotation-entry": "quotation_entry",
  "quotation-dashboard": "quotation_dashboard",
  "sale-order-entry": "sale_order_entry",
  "sale-order-dashboard": "sale_order_dashboard",
  "sale-return-entry": "sale_return",
  "sale-returns": "sale_return_dashboard",
  "sale-return-dashboard": "sale_return_dashboard",
  "advance-booking-dashboard": "advance_booking_dashboard",
  "purchase-entry": "purchase_bill",
  "purchase-bills": "purchase_dashboard",
  "purchase-bill-dashboard": "purchase_dashboard",
  "purchase-order-entry": "purchase_order_entry",
  "purchase-orders": "purchase_order_dashboard",
  "purchase-returns": "purchase_return_dashboard",
  "purchase-return-entry": "purchase_return",
  "stock-report": "stock_report",
  "item-wise-sales": "item_wise_sales",
  "item-wise-stock": "item_wise_stock",
  "stock-ageing": "stock_ageing",
  "stock-analysis": "stock_analysis",
  "daily-cashier-report": "daily_cashier_report",
  "daily-tally": "daily_tally",
  "daily-sale-analysis": "sale_analysis",
  "hourly-sales-analysis": "hourly_sales_analysis",
  "payments-dashboard": "payments_dashboard",
  "accounts-payments": "accounts_payments",
  accounts: "accounts_dashboard",
  "customer-party-balances": "customer_party_balances",
  "supplier-party-balances": "supplier_party_balances",
  reports: "reports_hub",
  insights: "business_insights",
  "delivery-dashboard": "delivery_dashboard",
  "delivery-challan-entry": "delivery_challan_entry",
  "delivery-challan-dashboard": "delivery_challan_dashboard",
  settings: "settings_view",
  "barcode-printing": "barcode_printing",
  "stock-adjustment": "stock_adjustment",
  "stock-settlement": "stock_settlement",
  "bulk-product-update": "bulk_product_update",
  "tally-export": "tally_export",
  "recycle-bin": "recycle_bin",
  "user-rights": "user_rights",
  "audit-log": "audit_logs",
  "whatsapp-inbox": "whatsapp_inbox",
};

export const getMenuPermissionForPath = (path: string) => {
  const cleanPath = normalizePath(path);
  return MENU_PERMISSION_BY_PATH[cleanPath];
};

/** First landing page when main dashboard is disabled (order = priority). */
export const LANDING_ROUTE_ORDER = [
  "pos-sales",
  "pos-dashboard",
  "sales-invoice",
  "sales-invoice-dashboard",
  "purchase-entry",
  "purchase-bills",
  "product-dashboard",
  "stock-report",
  "daily-cashier-report",
  "customers",
  "settings",
] as const;

const DASHBOARD_MENU_IDS = new Set(["main_dashboard", "dashboard_view", "dashboard_customize"]);

export function normalizeStoredMenuPermissions(
  menu: Record<string, boolean> | undefined | null,
): Record<string, boolean> {
  const out = { ...(menu || {}) };
  for (const [legacy, canonical] of Object.entries(LEGACY_MENU_ID_ALIASES)) {
    if (out[legacy] === true && out[canonical] !== true) {
      out[canonical] = true;
    }
  }
  return out;
}

/** True when submenu is enabled and parent "Dashboard" main menu is enabled (if permissions exist). */
/** Menu items enabled by default when custom permissions exist but the key was never saved. */
const DEFAULT_ON_MENU_IDS = new Set(["business_insights"]);

export function isMenuPermissionGranted(
  permissions: { menu?: Record<string, boolean>; mainMenu?: Record<string, boolean> } | null,
  menuId: string
): boolean {
  if (permissions === null) return true;

  const canonical = LEGACY_MENU_ID_ALIASES[menuId] ?? menuId;
  if (DASHBOARD_MENU_IDS.has(canonical) && permissions.mainMenu?.dashboard !== true) {
    return false;
  }

  const menu = normalizeStoredMenuPermissions(permissions.menu);
  if (menu[canonical] === true) return true;
  if (canonical !== menuId && menu[menuId] === true) return true;
  if (DEFAULT_ON_MENU_IDS.has(canonical) && menu[canonical] !== false) {
    return true;
  }
  return false;
}

/** Default route after login or when main dashboard is blocked. */
export function resolveFirstAllowedPath(
  hasMenuAccess: (menuId: string) => boolean,
  permissions: { menu?: Record<string, boolean>; mainMenu?: Record<string, boolean> } | null,
  organizationRole?: string | null
): string {
  if (permissions === null && organizationRole === "admin") {
    return "";
  }
  if (permissions === null) {
    return "";
  }
  if (hasMenuAccess("main_dashboard")) {
    return "";
  }
  for (const path of LANDING_ROUTE_ORDER) {
    const perm = getMenuPermissionForPath(path);
    if (perm && hasMenuAccess(perm)) {
      return path;
    }
  }
  if (hasMenuAccess("settings_view")) {
    return "settings";
  }
  return "pos-sales";
}