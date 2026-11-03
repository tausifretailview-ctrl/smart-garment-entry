/** One shop's row from get_all_shops_whatsapp_health (WhatsApp Logs > All shops health). */
export interface ShopWhatsAppHealthRow {
  organization_id: string;
  organization_name: string;
  send_provider: string | null;
  integration_on: boolean;
  builtin_status: string | null;
  builtin_status_at: string | null;
  builtin_number: string | null;
  total_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  pending_count: number;
  last_ok_at: string | null;
  last_failed_at: string | null;
  last_error: string | null;
}

export type ShopHealthState = "ok" | "failing" | "unlinked" | "idle" | "off";

/**
 * Off: no WhatsApp set up or the integration switched off. Not linked: Ezzy ERP WhatsApp number not
 * connected. Failing: the latest send in the last 2 days failed (how a WappConnect logout shows, since
 * WappConnect has no link status of its own). Working: the latest send went out. No sends: nothing lately.
 */
export function shopWhatsAppHealth(
  row: Pick<ShopWhatsAppHealthRow, "send_provider" | "integration_on" | "builtin_status" | "last_ok_at" | "last_failed_at">,
): ShopHealthState {
  if (!row.send_provider || !row.integration_on) return "off";
  if (row.send_provider === "builtin" && row.builtin_status && row.builtin_status !== "connected") return "unlinked";
  const ok = row.last_ok_at ? Date.parse(row.last_ok_at) : NaN;
  const failed = row.last_failed_at ? Date.parse(row.last_failed_at) : NaN;
  if (Number.isFinite(failed) && (!Number.isFinite(ok) || failed > ok)) return "failing";
  if (Number.isFinite(ok)) return "ok";
  return "idle";
}
