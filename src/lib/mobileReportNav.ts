import {
  IndianRupee,
  ShoppingBag,
  Package,
  Wallet,
  BarChart3,
  Calculator,
  LayoutGrid,
  PieChart,
  Grid3X3,
  Layers,
} from "lucide-react";
import {
  MOBILE_ACCOUNTS_PATH,
  MOBILE_REPORTS_PATH,
  MOBILE_SALES_PATH,
} from "@/lib/mobileShell";

/** Horizontal shortcuts for mobile reporting hubs (no data-entry routes). */
export const MOBILE_SUMMARY_STRIP_ITEMS = [
  { icon: IndianRupee, label: "Sales", path: MOBILE_SALES_PATH, color: "text-emerald-500" },
  { icon: ShoppingBag, label: "Purchase", path: "/owner-purchases", color: "text-blue-500" },
  { icon: Package, label: "Stock", path: "/owner-stock", color: "text-amber-500" },
  { icon: Wallet, label: "Accounts", path: MOBILE_ACCOUNTS_PATH, color: "text-indigo-500" },
  { icon: BarChart3, label: "Reports", path: MOBILE_REPORTS_PATH, color: "text-violet-500" },
  { icon: Calculator, label: "Cashier", path: `${MOBILE_REPORTS_PATH}?report=daily-cashier`, color: "text-purple-500" },
  { icon: BarChart3, label: "Item Sale", path: `${MOBILE_REPORTS_PATH}?report=item-wise-sales`, color: "text-teal-500" },
  { icon: Layers, label: "Item Stock", path: `${MOBILE_REPORTS_PATH}?report=item-wise-stock`, color: "text-indigo-500" },
  { icon: PieChart, label: "Net Profit", path: `${MOBILE_REPORTS_PATH}?report=net-profit`, color: "text-blue-500" },
  { icon: Package, label: "Stock Rpt", path: `${MOBILE_REPORTS_PATH}?report=stock-report`, color: "text-violet-500" },
  { icon: Grid3X3, label: "Size Stock", path: `${MOBILE_REPORTS_PATH}?report=size-wise-stock`, color: "text-fuchsia-500" },
  { icon: LayoutGrid, label: "More", path: "/mobile-more", color: "text-primary" },
] as const;
