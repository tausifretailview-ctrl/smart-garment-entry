import {
  IndianRupee,
  ShoppingBag,
  Package,
  Wallet,
  BarChart3,
  Calculator,
  LayoutGrid,
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
  { icon: Calculator, label: "Cashier", path: "/daily-cashier-report", color: "text-purple-500" },
  { icon: LayoutGrid, label: "More", path: "/mobile-more", color: "text-primary" },
] as const;
