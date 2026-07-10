import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  FileText,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
  RotateCcw,
  ClipboardList,
  Truck,
  Grid3X3,
  Banknote,
} from "lucide-react";

export type CommandPaletteGroup = "Actions" | "Go to";

export type CommandPaletteRegistryItem = {
  id: string;
  group: CommandPaletteGroup;
  label: string;
  subtitle?: string;
  icon: LucideIcon;
  path: string;
  /** Optional navigation state (e.g. new bill). */
  navState?: Record<string, unknown>;
  shortcutHint?: string;
  keywords?: string[];
  permission?: string;
};

/** Static client-side registry — fuzzy-matched instantly (no network). */
export const COMMAND_PALETTE_REGISTRY: CommandPaletteRegistryItem[] = [
  // Actions
  {
    id: "action-new-invoice",
    group: "Actions",
    label: "New Invoice",
    subtitle: "Create a new sales invoice",
    icon: FileText,
    path: "/sales-invoice",
    keywords: ["sale", "bill", "inv", "billing"],
    permission: "sales_invoice",
  },
  {
    id: "action-new-pos",
    group: "Actions",
    label: "Open POS",
    subtitle: "POS billing screen",
    icon: ShoppingCart,
    path: "/pos-sales",
    keywords: ["pos", "retail", "counter", "sale"],
    permission: "pos_sales",
  },
  {
    id: "action-new-purchase",
    group: "Actions",
    label: "New Purchase",
    subtitle: "Create a purchase bill",
    icon: Package,
    path: "/purchase-entry",
    navState: { newBill: true },
    keywords: ["purchase", "buy", "bill", "vendor"],
    permission: "purchase_bill",
  },
  {
    id: "action-sale-return",
    group: "Actions",
    label: "Sale Return",
    subtitle: "Record a customer return",
    icon: RotateCcw,
    path: "/sale-return-entry",
    keywords: ["return", "credit note"],
    permission: "sale_return",
  },
  {
    id: "action-quotation",
    group: "Actions",
    label: "New Quotation",
    subtitle: "Create a quotation",
    icon: ClipboardList,
    path: "/quotation-entry",
    keywords: ["quote", "estimate"],
    permission: "quotation_entry",
  },
  {
    id: "action-delivery-challan",
    group: "Actions",
    label: "Delivery Challan",
    subtitle: "Create delivery challan",
    icon: Truck,
    path: "/delivery-challan-entry",
    keywords: ["dc", "challan", "delivery"],
    permission: "delivery_challan_entry",
  },
  {
    id: "action-new-customer",
    group: "Actions",
    label: "New Customer",
    subtitle: "Customer master",
    icon: Users,
    path: "/customers",
    keywords: ["party", "client", "add customer"],
    permission: "customer_master",
  },

  // Go to
  {
    id: "nav-dashboard",
    group: "Go to",
    label: "Dashboard",
    subtitle: "Main dashboard",
    icon: LayoutDashboard,
    path: "/dashboard",
    permission: "main_dashboard",
  },
  {
    id: "nav-pos-dashboard",
    group: "Go to",
    label: "POS Dashboard",
    subtitle: "Today's POS sales",
    icon: ShoppingCart,
    path: "/pos-dashboard",
    permission: "pos_dashboard",
  },
  {
    id: "nav-sales-invoice-dashboard",
    group: "Go to",
    label: "Sales Invoice Dashboard",
    subtitle: "Invoice list & reports",
    icon: Receipt,
    path: "/sales-invoice-dashboard",
    permission: "sales_invoice_dashboard",
  },
  {
    id: "nav-stock-report",
    group: "Go to",
    label: "Stock Report",
    subtitle: "Inventory by item",
    icon: Grid3X3,
    path: "/stock-report",
    shortcutHint: "G then R",
    keywords: ["inventory", "stock", "size"],
    permission: "stock_report",
  },
  {
    id: "nav-daily-tally",
    group: "Go to",
    label: "Cash Tally",
    subtitle: "Daily cash tally",
    icon: Banknote,
    path: "/daily-tally",
    keywords: ["cash", "tally", "daily"],
    permission: "daily_tally",
  },
  {
    id: "nav-daily-cashier",
    group: "Go to",
    label: "Cashier Report",
    subtitle: "Daily cashier report",
    icon: Wallet,
    path: "/daily-cashier-report",
    permission: "daily_cashier_report",
  },
  {
    id: "nav-customer-ledger",
    group: "Go to",
    label: "Customer Ledger",
    subtitle: "Accounts · customer ledger",
    icon: BookOpen,
    path: "/accounts",
    navState: { tab: "customer-ledger" },
    keywords: ["ledger", "receivable", "balance"],
    permission: "customer_ledger",
  },
  {
    id: "nav-customer-balances",
    group: "Go to",
    label: "Customer Party Balances",
    subtitle: "Outstanding by customer",
    icon: Users,
    path: "/customer-party-balances",
    permission: "customer_party_balances",
  },
  {
    id: "nav-payments",
    group: "Go to",
    label: "Payments Dashboard",
    subtitle: "Receipts & payments",
    icon: Wallet,
    path: "/payments-dashboard",
    permission: "payments_dashboard",
  },
  {
    id: "nav-purchase-dashboard",
    group: "Go to",
    label: "Purchase Dashboard",
    subtitle: "Purchase bills list",
    icon: Package,
    path: "/purchase-bill-dashboard",
    permission: "purchase_dashboard",
  },
  {
    id: "nav-product-dashboard",
    group: "Go to",
    label: "Product Dashboard",
    subtitle: "Product master list",
    icon: Package,
    path: "/products",
    permission: "product_dashboard",
  },
  {
    id: "nav-sale-analysis",
    group: "Go to",
    label: "Sales Report",
    subtitle: "Daily sale analysis",
    icon: TrendingUp,
    path: "/daily-sale-analysis",
    shortcutHint: "G then R",
    keywords: ["report", "analysis", "sales"],
    permission: "sale_analysis",
  },
  {
    id: "nav-reports",
    group: "Go to",
    label: "Reports Hub",
    subtitle: "All reports",
    icon: BarChart3,
    path: "/reports",
    permission: "reports_hub",
  },
  {
    id: "nav-settings",
    group: "Go to",
    label: "Settings",
    subtitle: "Organization settings",
    icon: Settings,
    path: "/settings",
    permission: "settings_view",
  },
];

export function scoreRegistryMatch(query: string, item: CommandPaletteRegistryItem): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const label = item.label.toLowerCase();
  const subtitle = (item.subtitle || "").toLowerCase();
  const keywords = (item.keywords || []).join(" ").toLowerCase();
  const haystack = `${label} ${subtitle} ${keywords}`;
  let score = 0;
  if (label.startsWith(q)) score += 100;
  else if (label.includes(q)) score += 60;
  if (subtitle.includes(q)) score += 30;
  if (keywords.includes(q)) score += 25;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => haystack.includes(t))) score += 40;
  return score;
}

export function filterRegistryItems(
  items: CommandPaletteRegistryItem[],
  query: string,
  limit = 5,
): CommandPaletteRegistryItem[] {
  const q = query.trim();
  if (!q) {
    return items.slice(0, limit);
  }
  return items
    .map((item) => ({ item, score: scoreRegistryMatch(q, item) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
    .slice(0, limit)
    .map((row) => row.item);
}
