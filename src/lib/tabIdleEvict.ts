import { resolveTabCachePath } from "@/lib/tabPageRegistry";

/** Read-only screens may leave memory after a few idle minutes. Live bills stay mounted. */
export const READ_ONLY_IDLE_UNMOUNT_MS = 4 * 60 * 1000;

const LIVE_WORK_TAB_PATHS = new Set([
  "pos-sales",
  "pos-delivery-challan",
  "sales-invoice",
  "purchase-entry",
  "sale-return-entry",
  "purchase-return-entry",
  "product-entry",
  "quotation-entry",
  "sale-order-entry",
]);

export function isIdleEvictableDashboardPath(path: string): boolean {
  const resolved = resolveTabCachePath(path);
  if (!resolved || LIVE_WORK_TAB_PATHS.has(resolved)) return false;
  if (resolved === "settings" || resolved === "user-rights" || resolved === "stock-report") return true;
  return resolved === "reports" || resolved.endsWith("-report") || resolved.endsWith("-reports");
}
