import { resolveTabCachePath } from "@/lib/tabPageRegistry";

/**
 * Human labels for org routes — shared by window tabs and document.title.
 * Keys are tab/route path segments (after org slug); aliases follow resolveTabCachePath.
 */
export const PAGE_TITLE_CONFIG: Record<string, { label: string; icon: string }> = {
  "": { label: "Dashboard", icon: "Home" },
  dashboard: { label: "Dashboard", icon: "Home" },
  "pos-sales": { label: "POS Sales", icon: "ShoppingCart" },
  "pos-delivery-challan": { label: "POS DC", icon: "Truck" },
  "pos-dashboard": { label: "POS Dashboard", icon: "Receipt" },
  "sales-invoice": { label: "Sales Invoice", icon: "FileText" },
  "sales-invoice-dashboard": { label: "Sales Dashboard", icon: "FileText" },
  "quotation-entry": { label: "Quotation", icon: "ClipboardList" },
  "quotation-dashboard": { label: "Quotations", icon: "ClipboardList" },
  "sale-order-entry": { label: "Sale Order", icon: "ClipboardList" },
  "sale-order-dashboard": { label: "Sale Orders", icon: "ClipboardList" },
  "sale-return-entry": { label: "Sale Return", icon: "ArrowLeftRight" },
  "sale-returns": { label: "Sale Returns", icon: "ArrowLeftRight" },
  "sale-return-dashboard": { label: "Sale Returns", icon: "ArrowLeftRight" },
  "purchase-entry": { label: "Purchase Entry", icon: "Package" },
  "purchase-bill-dashboard": { label: "Purchase Bills", icon: "Package" },
  "purchase-bills": { label: "Purchase Bills", icon: "Package" },
  "purchase-return-entry": { label: "Purchase Return", icon: "ArrowLeftRight" },
  "purchase-return-dashboard": { label: "Purchase Returns", icon: "ArrowLeftRight" },
  "purchase-returns": { label: "Purchase Returns", icon: "ArrowLeftRight" },
  "product-entry": { label: "Product Entry", icon: "Tag" },
  "product-dashboard": { label: "Products", icon: "Layers" },
  products: { label: "Products", icon: "Layers" },
  customers: { label: "Customers", icon: "Users" },
  "accounting/customer": { label: "Customer Account", icon: "Users" },
  suppliers: { label: "Suppliers", icon: "Building2" },
  employees: { label: "Employees", icon: "UserCheck" },
  "salesman-commission": { label: "Commission", icon: "UserCheck" },
  "bulk-product-update": { label: "Bulk Update", icon: "Layers" },
  "stock-settlement": { label: "Stock Settlement", icon: "Package" },
  "stock-adjustment": { label: "Stock Adjustment", icon: "Package" },
  "stock-report": { label: "Stock Report", icon: "BarChart3" },
  "stock-ageing": { label: "Stock Ageing", icon: "BarChart3" },
  "stock-analysis": { label: "Stock Analysis", icon: "BarChart3" },
  reports: { label: "Reports Hub", icon: "BarChart3" },
  "item-wise-sales": { label: "Item Sales", icon: "PieChart" },
  "item-wise-stock": { label: "Item Stock", icon: "PieChart" },
  "sales-report-by-customer": { label: "Customer Sales", icon: "TrendingUp" },
  "sales-report": { label: "Customer Sales", icon: "TrendingUp" },
  "purchase-report-by-supplier": { label: "Supplier Report", icon: "TrendingUp" },
  "purchase-report": { label: "Supplier Report", icon: "TrendingUp" },
  "price-history": { label: "Price History", icon: "History" },
  "product-tracking": { label: "Product Tracking", icon: "History" },
  "daily-cashier-report": { label: "Daily Cashier", icon: "CalendarDays" },
  "daily-tally": { label: "Daily Tally", icon: "CalendarDays" },
  "daily-sale-analysis": { label: "Daily Sale Analysis", icon: "BarChart3" },
  "hourly-sales-analysis": { label: "Hourly Sales", icon: "BarChart3" },
  "sales-analytics": { label: "Sales Analytics", icon: "BarChart3" },
  "net-profit-analysis": { label: "Net Profit", icon: "BarChart3" },
  "einvoice-report": { label: "E-Invoice Report", icon: "FileSpreadsheet" },
  "customer-ledger-report": { label: "Customer Ledger", icon: "BookOpen" },
  "customer-points-report": { label: "Customer Points", icon: "BarChart3" },
  "customer-account-statement": { label: "Account Statement", icon: "BookOpen" },
  "customer-account-statement-audit": { label: "Statement Audit", icon: "History" },
  "customer-balance-activity": { label: "Balance Activity", icon: "BarChart3" },
  "customer-party-balances": { label: "Customer Balances", icon: "Users" },
  "supplier-party-balances": { label: "Supplier Balances", icon: "Building2" },
  "customer-audit-report": { label: "Customer Audit", icon: "History" },
  "customer-reconciliation": { label: "Customer Reconciliation", icon: "History" },
  "stock-reconciliation": { label: "Stock Reconciliation", icon: "History" },
  "accounting-reports": { label: "Accounting Reports", icon: "BookOpen" },
  "expense-salary-report": { label: "Expense & Salary", icon: "Wallet" },
  "gst-register": { label: "GST Register", icon: "FileSpreadsheet" },
  "gst-reports": { label: "GST Reports", icon: "FileSpreadsheet" },
  "tally-export": { label: "Tally Export", icon: "FileSpreadsheet" },
  "payments-dashboard": { label: "Payments", icon: "Wallet" },
  "accounts-payments": { label: "Payments", icon: "Wallet" },
  accounts: { label: "Accounts", icon: "BookOpen" },
  "chart-of-accounts": { label: "Chart of Accounts", icon: "BookOpen" },
  "journal-vouchers": { label: "Journal Vouchers", icon: "BookOpen" },
  "manual-journal": { label: "Manual Journal", icon: "BookOpen" },
  "ledger-opening-balances": { label: "Opening Balances", icon: "BookOpen" },
  "third-party-entry": { label: "Third Party Entry", icon: "BookOpen" },
  "third-party-balances": { label: "Third Party Balances", icon: "BookOpen" },
  "purchase-orders": { label: "Purchase Orders", icon: "ClipboardList" },
  "delivery-challan-dashboard": { label: "Delivery Challans", icon: "Truck" },
  "delivery-dashboard": { label: "Delivery", icon: "Truck" },
  "advance-booking-dashboard": { label: "Advance Booking", icon: "Wallet" },
  "discount-scheme-dashboard": { label: "Discount Scheme", icon: "Percent" },
  "barcode-printing": { label: "Barcode Print", icon: "Printer" },
  settings: { label: "Settings", icon: "Settings" },
  website: { label: "Website", icon: "Store" },
  backup: { label: "Backup", icon: "Database" },
  profile: { label: "Profile", icon: "UserCheck" },
  "audit-log": { label: "Audit Log", icon: "History" },
  "user-rights": { label: "User Rights", icon: "UserCheck" },
  "recycle-bin": { label: "Recycle Bin", icon: "History" },
};

const APP_TITLE_SUFFIX = "Ezzy ERP";
const DEFAULT_DOCUMENT_TITLE = "EzzyERP - Easy Billing, Smart Business";

function humanizePathSegment(path: string): string {
  const leaf = path.split("/").filter(Boolean).pop() || "Dashboard";
  return leaf
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Resolve a friendly page label for tabs / document.title. */
export function resolvePageTitleLabel(orgPathSegment: string): string {
  const resolved = resolveTabCachePath(orgPathSegment || "");
  const direct = PAGE_TITLE_CONFIG[resolved] ?? PAGE_TITLE_CONFIG[orgPathSegment];
  if (direct?.label) return direct.label;
  return humanizePathSegment(resolved || orgPathSegment || "dashboard");
}

/**
 * Browser / Electron window title: "POS Sales — Ezzy ERP"
 * (optional org name: "POS Sales — Shop Name — Ezzy ERP")
 */
export function formatDocumentTitle(
  orgPathSegment: string,
  organizationName?: string | null,
): string {
  const page = resolvePageTitleLabel(orgPathSegment);
  const org = organizationName?.trim();
  if (org) return `${page} — ${org} — ${APP_TITLE_SUFFIX}`;
  return `${page} — ${APP_TITLE_SUFFIX}`;
}

export function getDefaultDocumentTitle(): string {
  return DEFAULT_DOCUMENT_TITLE;
}
