/**
 * Wholesale Dashboard: an app-launcher home (icon grid of the main pages), switched on in
 * Settings → Company → Home page (sale_settings.wholesale_dashboard, default off). The left and
 * top menus stay as they are. Each tile shows only when the user's rights open that page.
 */
import { getMenuPermissionForPath } from "@/lib/menuPermissions";

export const WHOLESALE_DASHBOARD_KEY = "wholesale_dashboard";
export const LAUNCHER_FAVOURITES_KEY = "ezzy-launcher-favourites-v1";
export const LAUNCHER_RECENTS_KEY = "ezzy-launcher-recents-v1";
export const LAUNCHER_VIEW_KEY = "ezzy-launcher-view-v1";
export const LAUNCHER_RECENTS_MAX = 6;

export type LauncherGroup = "Sales" | "Purchase" | "Inventory" | "Parties" | "Accounts" | "Reports" | "Setup";

export const LAUNCHER_GROUPS: LauncherGroup[] = ["Sales", "Purchase", "Inventory", "Parties", "Accounts", "Reports", "Setup"];

export type LauncherTile = {
  /** Page path after the shop slug (also the tile id). */
  path: string;
  label: string;
  group: LauncherGroup;
  /** lucide-react icon name (see WholesaleLauncher ICONS). */
  icon: string;
  /** Two colours of the tile's gradient. */
  from: string;
  to: string;
  /** Extra words that should find it in the search box. */
  keywords?: string;
};

export const LAUNCHER_TILES: LauncherTile[] = [
  { path: "sales-invoice", label: "Sale Invoice", group: "Sales", icon: "FilePlus2", from: "#2563eb", to: "#7c3aed", keywords: "bill new sale gst" },
  { path: "sales-invoice-dashboard", label: "Sales", group: "Sales", icon: "Receipt", from: "#0ea5e9", to: "#2563eb", keywords: "invoices dashboard bills" },
  { path: "sale-order-entry", label: "Sale Order", group: "Sales", icon: "ClipboardPen", from: "#f97316", to: "#ef4444", keywords: "order booking new" },
  { path: "sale-order-dashboard", label: "Sale Orders", group: "Sales", icon: "ClipboardList", from: "#fb923c", to: "#f59e0b", keywords: "pending orders" },
  { path: "quotation-dashboard", label: "Quotations", group: "Sales", icon: "FilePenLine", from: "#14b8a6", to: "#0ea5e9", keywords: "estimate proforma" },
  { path: "delivery-challan-dashboard", label: "Delivery Challan", group: "Sales", icon: "Truck", from: "#22c55e", to: "#0d9488", keywords: "dc dispatch" },
  { path: "sale-returns", label: "Sale Returns", group: "Sales", icon: "Undo2", from: "#f43f5e", to: "#be123c", keywords: "credit note return" },
  { path: "eway-bills", label: "E-way Bills", group: "Sales", icon: "Route", from: "#6366f1", to: "#0ea5e9", keywords: "ewb transport" },
  { path: "pos-sales", label: "POS Billing", group: "Sales", icon: "ScanBarcode", from: "#a855f7", to: "#ec4899", keywords: "counter retail" },
  { path: "purchase-entry", label: "Purchase Bill", group: "Purchase", icon: "PackagePlus", from: "#059669", to: "#16a34a", keywords: "new purchase inward" },
  { path: "purchase-bills", label: "Purchases", group: "Purchase", icon: "ShoppingBag", from: "#10b981", to: "#0891b2", keywords: "purchase dashboard bills" },
  { path: "purchase-orders", label: "Purchase Orders", group: "Purchase", icon: "ClipboardCheck", from: "#84cc16", to: "#16a34a", keywords: "po" },
  { path: "purchase-returns", label: "Purchase Returns", group: "Purchase", icon: "PackageMinus", from: "#ef4444", to: "#f97316", keywords: "debit note return" },
  { path: "products", label: "Products", group: "Inventory", icon: "Boxes", from: "#8b5cf6", to: "#6366f1", keywords: "items catalogue" },
  { path: "product-entry", label: "Add Product", group: "Inventory", icon: "PackageOpen", from: "#c026d3", to: "#7c3aed", keywords: "new item" },
  { path: "product-master", label: "Product Master", group: "Inventory", icon: "ClipboardList", from: "#7c3aed", to: "#2563eb", keywords: "brands categories colours hsn product list create items" },
  { path: "stock-report", label: "Stock", group: "Inventory", icon: "Warehouse", from: "#0891b2", to: "#4f46e5", keywords: "stock report inventory" },
  { path: "stock-analysis", label: "Stock Analysis", group: "Inventory", icon: "ChartPie", from: "#06b6d4", to: "#8b5cf6", keywords: "ageing slow fast" },
  { path: "barcode-printing", label: "Barcodes", group: "Inventory", icon: "Barcode", from: "#334155", to: "#0f172a", keywords: "labels print" },
  { path: "customers", label: "Customers", group: "Parties", icon: "Users", from: "#3b82f6", to: "#06b6d4", keywords: "party buyers" },
  { path: "suppliers", label: "Suppliers", group: "Parties", icon: "Factory", from: "#f59e0b", to: "#d97706", keywords: "vendors party" },
  { path: "transporters", label: "Transporters", group: "Parties", icon: "Container", from: "#64748b", to: "#0ea5e9", keywords: "transport master courier" },
  { path: "customer-party-balances", label: "Receivables", group: "Parties", icon: "HandCoins", from: "#16a34a", to: "#65a30d", keywords: "outstanding due customer balance" },
  { path: "supplier-party-balances", label: "Payables", group: "Parties", icon: "Banknote", from: "#dc2626", to: "#ea580c", keywords: "outstanding supplier balance" },
  { path: "accounts", label: "Accounts", group: "Accounts", icon: "Landmark", from: "#4f46e5", to: "#7c3aed", keywords: "ledger vouchers" },
  { path: "payments-dashboard", label: "Payments", group: "Accounts", icon: "Wallet", from: "#0d9488", to: "#22c55e", keywords: "receipts payments" },
  { path: "customer-ledger-report", label: "Customer Ledger", group: "Accounts", icon: "BookOpenText", from: "#2563eb", to: "#0891b2", keywords: "statement ledger" },
  { path: "daily-cashier-report", label: "Business Report", group: "Reports", icon: "CalendarRange", from: "#e11d48", to: "#9333ea", keywords: "daily cash report" },
  { path: "item-wise-sales", label: "Item-wise Sales", group: "Reports", icon: "ChartColumnBig", from: "#f97316", to: "#db2777", keywords: "product sales report" },
  { path: "settings", label: "Settings", group: "Setup", icon: "Settings", from: "#475569", to: "#1e293b", keywords: "preferences" },
];

export function isWholesaleDashboardEnabled(saleSettings: unknown): boolean {
  if (!saleSettings || typeof saleSettings !== "object") return false;
  return (saleSettings as Record<string, unknown>)[WHOLESALE_DASHBOARD_KEY] === true;
}

/** Tiles this user may open (admins and users without custom rights see all). */
export function visibleLauncherTiles(
  hasMenuAccess: (menuId: string) => boolean,
  isAdmin: boolean,
  tiles: LauncherTile[] = LAUNCHER_TILES,
): LauncherTile[] {
  if (isAdmin) return tiles;
  return tiles.filter((t) => {
    const right = getMenuPermissionForPath(t.path);
    return right ? hasMenuAccess(right) : false;
  });
}

/** Tiles matching the search box: label first, then group / keywords. */
export function searchLauncherTiles(tiles: LauncherTile[], query: string): LauncherTile[] {
  const q = query.trim().toLowerCase();
  if (!q) return tiles;
  const words = q.split(/\s+/);
  const score = (t: LauncherTile) => {
    const label = t.label.toLowerCase();
    const rest = `${t.group} ${t.keywords ?? ""}`.toLowerCase();
    if (!words.every((w) => label.includes(w) || rest.includes(w))) return -1;
    if (label.startsWith(q)) return 3;
    if (label.includes(q)) return 2;
    return 1;
  };
  return tiles
    .map((t, i) => ({ t, s: score(t), i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.t);
}

/** Stored list of tile paths (favourites / recents); unknown or bad entries are dropped. */
export function parseLauncherPathList(raw: string | null | undefined, max = 30): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const known = new Set(LAUNCHER_TILES.map((t) => t.path));
    const out: string[] = [];
    for (const v of value) {
      if (typeof v === "string" && known.has(v) && !out.includes(v)) out.push(v);
      if (out.length >= max) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Most recent first, no repeats, capped. */
export function pushRecent(list: string[], path: string, max = LAUNCHER_RECENTS_MAX): string[] {
  return [path, ...list.filter((p) => p !== path)].slice(0, max);
}

export function toggleFavourite(list: string[], path: string): string[] {
  return list.includes(path) ? list.filter((p) => p !== path) : [...list, path];
}

export function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
