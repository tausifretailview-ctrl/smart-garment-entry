/**
 * Default Quantity pre-filled in the service product popup (Quantity / MRP / Add to Cart)
 * on Sale bill, POS and POS delivery challan. Set in Settings > Reports; 1 when unset.
 * Stored in `settings.report_settings.service_default_qty` (no extra column).
 */
type SettingsLike = Record<string, any> | null | undefined;

export const SERVICE_DEFAULT_QTY_MAX = 9999;

export function normalizeServiceDefaultQty(value: unknown): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(SERVICE_DEFAULT_QTY_MAX, Math.floor(n));
}

export function resolveServiceDefaultQty(settings: SettingsLike): number {
  return normalizeServiceDefaultQty(settings?.report_settings?.service_default_qty);
}
