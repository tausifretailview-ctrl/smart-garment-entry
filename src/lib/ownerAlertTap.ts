const SALE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OwnerAlertTap = { saleId: string } | { path: string };

/**
 * What a tapped alert opens. An invoice alert opens that bill's details; cashier and
 * day-end reports open the Cashier Report. Older owner-alerts bundles sent
 * "/pos-dashboard" for both, so the mapping is done here and works without a redeploy.
 */
export function ownerAlertTapTarget(data: unknown): OwnerAlertTap | null {
  const d = (data ?? {}) as { route?: unknown; sale_id?: unknown };
  const saleId = typeof d.sale_id === "string" ? d.sale_id : "";
  if (SALE_ID.test(saleId)) return { saleId };
  const route = typeof d.route === "string" ? d.route : "";
  if (!route.startsWith("/") || route.startsWith("//")) return null;
  if (route === "/pos-dashboard") return { path: "/daily-cashier-report" };
  return { path: route };
}
