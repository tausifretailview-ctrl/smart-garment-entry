import type { LucideIcon } from "lucide-react";
import {
  BarChart2,
  Building2,
  CreditCard,
  MessageCircle,
  Package,
  Palette,
  Printer,
  Receipt,
  ShoppingCart,
  Store,
  Users,
} from "lucide-react";

/** Visible Settings tabs. SMS is intentionally omitted — WhatsApp covers messaging. */
export type SettingsTabId =
  | "company"
  | "product"
  | "purchase"
  | "sale"
  | "pos"
  | "bill"
  | "payment"
  | "reports"
  | "users"
  | "whatsapp"
  | "branding";

export type SettingsTabItem = {
  id: SettingsTabId;
  label: string;
  icon: LucideIcon;
};

export const SETTINGS_TAB_ITEMS: SettingsTabItem[] = [
  { id: "company", label: "Company", icon: Building2 },
  { id: "product", label: "Product", icon: Package },
  { id: "purchase", label: "Purchase", icon: ShoppingCart },
  { id: "sale", label: "Sale", icon: Receipt },
  { id: "pos", label: "POS", icon: Store },
  { id: "bill", label: "Bill & Barcode", icon: Printer },
  { id: "payment", label: "Payment", icon: CreditCard },
  { id: "reports", label: "Reports", icon: BarChart2 },
  { id: "users", label: "User Rights", icon: Users },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "branding", label: "Branding", icon: Palette },
];

export const SETTINGS_TAB_IDS: SettingsTabId[] = SETTINGS_TAB_ITEMS.map((tab) => tab.id);

export const SETTINGS_TAB_SUBTITLE = SETTINGS_TAB_ITEMS.map((tab) => tab.label).join(" · ");

/** SMS is covered by WhatsApp. Backup is a main-menu page after Website. */
export const HIDDEN_SETTINGS_TABS = ["sms", "backup"] as const;

/** Input/control ids that belong on Settings → POS (not Sale). */
export const POS_TAB_SETTING_FIELD_IDS = [
  "default_pos_tax_type",
  "pos_numbering_format",
  "pos_series_start",
  "default_discount_in_rupees",
  "default_discount",
  "pos_allow_date_change",
  "allow_pos_edit_unit_price",
  "pos_unit_price_override_confirm_pct",
  "pos_quick_price_code",
  "pos_retain_salesman",
  "pos_barcode_price_mode",
  "pos_goods_ask_qty_dialog",
  "pos_category_tier_pricing",
  "pos_bill_format",
  "pos_invoice_template",
] as const;

export function isVisibleSettingsTab(id: string): id is SettingsTabId {
  return (SETTINGS_TAB_IDS as string[]).includes(id);
}

export function coerceSettingsTab(id: string | null | undefined): SettingsTabId {
  if (id && isVisibleSettingsTab(id)) return id;
  return "company";
}
