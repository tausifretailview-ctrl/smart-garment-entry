import { resolveTabCachePath } from "@/lib/tabPageRegistry";

/** User-facing “Opening …” copy while a tab chunk downloads. */
const TAB_LOAD_LABELS: Record<string, string> = {
  "": "Opening dashboard…",
  dashboard: "Opening dashboard…",
  customers: "Opening Customers…",
  suppliers: "Opening Suppliers…",
  employees: "Opening Employees…",
  accounts: "Opening Accounts…",
  "accounts-payments": "Opening Payments…",
  "payments-dashboard": "Opening Payments…",
  "customer-account-statement": "Opening Customer Ledger…",
  "customer-party-balances": "Opening Customer Balances…",
  "customer-ledger-report": "Opening Customer Ledger…",
  settings: "Opening Settings…",
  backup: "Opening Backup…",
  website: "Opening Website…",
  "user-rights": "Opening User Rights…",
  "pos-sales": "Opening POS…",
  "pos-dashboard": "Opening POS Dashboard…",
  "pos-delivery-challan": "Opening Delivery Challan POS…",
  "sales-invoice": "Opening Sale Invoice…",
  "sales-invoice-dashboard": "Opening Invoice Dashboard…",
  "purchase-entry": "Opening Purchase Entry…",
  "purchase-bills": "Opening Purchase Bills…",
  "purchase-bill-dashboard": "Opening Purchase Bills…",
  "product-entry": "Opening Product Entry…",
  products: "Opening Products…",
  "product-dashboard": "Opening Product Dashboard…",
  "stock-report": "Opening Stock Report…",
  "stock-analysis": "Opening Stock Analysis…",
  "barcode-printing": "Opening Barcode Printing…",
  reports: "Opening Reports…",
  "daily-cashier-report": "Opening Cashier Report…",
  "sales-analytics": "Opening Sales Analytics…",
  "net-profit-analysis": "Opening Net Profit…",
  "supplier-party-balances": "Opening Supplier Balances…",
  "sale-returns": "Opening Sale Returns…",
  "sale-return-dashboard": "Opening Sale Returns…",
  "purchase-return-dashboard": "Opening Purchase Returns…",
};

export function tabLoadMessage(
  path: string,
  shell: "entry" | "dashboard" | "page",
): string {
  const resolved = resolveTabCachePath(path);
  const named = TAB_LOAD_LABELS[resolved];
  if (named) return named;
  if (shell === "entry") return "Loading bill screen…";
  if (shell === "dashboard") return "Loading dashboard…";
  return "Loading page…";
}
