/**
 * Optional menus: screens a new shop rarely needs, hidden until the shop turns them on in
 * Settings → Optional menus. Stored on organizations.settings.optional_menus.
 *
 * Existing shops have no `optional_menus` key and keep every menu (missing = shown). A new
 * organization gets every group set to false by the database (SQL file 53, on insert), so its
 * menu starts short. User rights still apply on top: a group turned on shows only to users
 * who already have the right.
 */
export const OPTIONAL_MENU_GROUPS = {
  masters: {
    label: "Transport, staff & salesman",
    help: "Master → Transport Master, Employee Master, Commission, Salesman Location",
    paths: ["/transporters", "/employees", "/salesman-commission", "/salesman-locations"],
  },
  stock_tools: {
    label: "Stock settlement & adjustment",
    help: "Inventory → Stock Settlement, Stock Adjustment",
    paths: ["/stock-settlement", "/stock-adjustment"],
  },
  data_checks: {
    label: "Data checks",
    help: "Inventory → Duplicate Purchase Bills, Customer Balance Reconciliation",
    paths: ["/duplicate-purchase-bills", "/customer-reconciliation"],
  },
  customer_reports: {
    label: "Extra customer reports",
    help:
      "Reports → Payment Flow, Customer Account Statement, Account statement (audit), Customer balance & activity, " +
      "CN / S-R Adjustment Register, Customer Reviews, Customer Notifications, Customer Audit Report",
    paths: [
      "/payment-flow",
      "/customer-account-statement",
      "/customer-account-statement-audit",
      "/customer-balance-activity",
      "/cn-sr-adjustment-register",
      "/customer-reviews",
      "/customer-notifications",
      "/customer-audit-report",
    ],
  },
  website: {
    label: "Website",
    help: "Settings → Website (online store)",
    paths: ["/website"],
  },
} as const;

export type OptionalMenuGroup = keyof typeof OPTIONAL_MENU_GROUPS;
export type OptionalMenus = Record<OptionalMenuGroup, boolean>;

export const OPTIONAL_MENU_GROUP_KEYS = Object.keys(OPTIONAL_MENU_GROUPS) as OptionalMenuGroup[];

/** Which groups are shown for this organization (organizations.settings). Missing = shown. */
export function resolveOptionalMenus(orgSettings: unknown): OptionalMenus {
  const raw =
    orgSettings && typeof orgSettings === "object"
      ? (orgSettings as { optional_menus?: Partial<Record<OptionalMenuGroup, unknown>> | null }).optional_menus
      : undefined;
  const out = {} as OptionalMenus;
  for (const key of OPTIONAL_MENU_GROUP_KEYS) out[key] = raw?.[key] !== false;
  return out;
}

/** False when the page at `path` belongs to a group this shop has turned off. */
export function isOptionalMenuPathShown(path: string, menus: OptionalMenus): boolean {
  const clean = "/" + String(path || "").replace(/^\/+/, "").split(/[?#]/)[0];
  for (const key of OPTIONAL_MENU_GROUP_KEYS) {
    if ((OPTIONAL_MENU_GROUPS[key].paths as readonly string[]).includes(clean)) return menus[key];
  }
  return true;
}
