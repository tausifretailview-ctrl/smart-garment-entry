import { gatewayRequest, getBulkGatewayConfig } from "./builtinGatewaySend.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

/**
 * A number just opted out of these shops' bulk messages (STOP to the bill number, Block in the
 * Inbox, STOP to the bulk number). Campaigns still running, paused or scheduled days ahead already
 * hold the number, so tell the bulk WhatsApp server to drop it from them. Best effort: an old
 * server without the route, or one that is down, only logs a warning (the opt-out itself is saved).
 */
export async function dropOptedOutFromCampaigns(db: Db, orgIds: string[], phone: string): Promise<number> {
  if (!orgIds.length || !phone) return 0;
  const { data, error } = await db
    .from("bulk_whatsapp_campaigns")
    .select("id")
    .in("organization_id", orgIds)
    .in("status", ["running", "paused"])
    .limit(200);
  if (error) {
    console.warn("[bulk opt-out] campaigns lookup failed:", error.message);
    return 0;
  }
  const campaignIds = (data ?? []).map((c: { id: string }) => c.id);
  if (!campaignIds.length) return 0;
  const result = await gatewayRequest("/campaigns/drop-number", { method: "POST", body: { phone, campaignIds } }, getBulkGatewayConfig());
  if (!result.ok) {
    console.warn("[bulk opt-out] drop-number failed:", result.status, result.data?.error ?? "");
    return 0;
  }
  return Number(result.data?.dropped) || 0;
}
