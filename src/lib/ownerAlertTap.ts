const SALE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Old owner-alerts bundles sent these for cashier, day-end and test alerts. */
const REPORT_ROUTES = new Set(["/pos-dashboard", "/daily-cashier-report"]);

/**
 * Screen a tapped owner alert opens: a bill alert opens just that bill, cashier and
 * day-end alerts open the colour day report. Older owner-alerts bundles sent
 * "/pos-dashboard", so the mapping is done here and works without a redeploy.
 */
export function ownerAlertTapPath(data: unknown): string | null {
  const d = (data ?? {}) as { route?: unknown; sale_id?: unknown };
  const saleId = typeof d.sale_id === "string" ? d.sale_id : "";
  if (SALE_ID.test(saleId)) return `/owner-alert/bill/${saleId}`;
  const route = typeof d.route === "string" ? d.route : "";
  if (!route.startsWith("/") || route.startsWith("//")) return null;
  if (REPORT_ROUTES.has(route)) return "/owner-alert/report";
  return route;
}
