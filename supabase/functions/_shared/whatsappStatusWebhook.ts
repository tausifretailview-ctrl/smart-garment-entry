/** Shared delivery/read status helpers for whatsapp-webhook (Meta + WappConnect BSP + instance API). */

export const WHATSAPP_STATUS_RANK: Record<string, number> = {
  failed: -1,
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

export function normalizeWhatsAppDeliveryStatus(raw: string): string {
  const status = String(raw || "").trim().toLowerCase();
  if (status === "queued") return "sent";
  if (status === "seen") return "read";
  if (status === "played") return "read";
  return status;
}

export function buildWhatsAppStatusUpdate(
  normStatus: string,
  timestampIso = new Date().toISOString(),
  errorMessage?: string,
): Record<string, string> {
  const updatePayload: Record<string, string> = { status: normStatus };
  if (normStatus === "delivered") updatePayload.delivered_at = timestampIso;
  if (normStatus === "read") {
    updatePayload.read_at = timestampIso;
    updatePayload.delivered_at = timestampIso;
  }
  if (normStatus === "failed") {
    updatePayload.error_message = errorMessage || "Delivery failed";
  }
  return updatePayload;
}

export function shouldApplyWhatsAppStatus(currentStatus: string, incomingStatus: string): boolean {
  const currentRank = WHATSAPP_STATUS_RANK[currentStatus] ?? 0;
  const incomingRank = WHATSAPP_STATUS_RANK[incomingStatus] ?? 1;
  return incomingRank > currentRank || incomingStatus === "failed";
}

export async function findWhatsappLogForStatusUpdate(
  supabase: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => {
              maybeSingle: () => Promise<{ data: { id: string; status: string } | null; error: unknown }>;
            };
          };
        };
        contains: (col: string, val: Record<string, unknown>) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => {
              maybeSingle: () => Promise<{ data: { id: string; status: string } | null; error: unknown }>;
            };
          };
        };
      };
    };
  },
  messageId: string,
): Promise<{ id: string; status: string } | null> {
  const trimmed = String(messageId || "").trim();
  if (!trimmed) return null;

  const { data: byWamid } = await supabase
    .from("whatsapp_logs")
    .select("id, status")
    .eq("wamid", trimmed)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byWamid) return byWamid;

  const { data: byMessageIds } = await supabase
    .from("whatsapp_logs")
    .select("id, status")
    .contains("provider_response", { data: { messageIDs: [trimmed] } })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byMessageIds) return byMessageIds;

  return null;
}

export async function applyWhatsappLogStatusUpdate(
  supabase: {
    from: (table: string) => {
      update: (payload: Record<string, string>) => {
        eq: (col: string, val: string) => Promise<{ error: unknown }>;
      };
    };
  },
  logId: string,
  wamid: string | null,
  normStatus: string,
  timestampIso: string,
  errorMessage?: string,
): Promise<void> {
  if (!shouldApplyWhatsAppStatus("sent", normStatus)) {
    // caller passes existing status check separately
  }

  const updatePayload = buildWhatsAppStatusUpdate(normStatus, timestampIso, errorMessage);

  await supabase.from("whatsapp_logs").update(updatePayload).eq("id", logId);

  if (wamid) {
    await supabase.from("whatsapp_messages").update(updatePayload).eq("wamid", wamid);
  }
}

/** WappConnect instance API + generic provider status callbacks (non-Meta `entry` format). */
export function parseProviderStatusWebhook(
  body: Record<string, unknown>,
): { messageId: string; status: string; timestampIso?: string; errorMessage?: string } | null {
  const event = String(body.event || body.type || body.action || "").toLowerCase();

  if (event === "message.status" || event === "message_status") {
    const data = body.data as Record<string, unknown> | undefined;
    const messageId = String(data?.message_id || data?.messageId || data?.id || "").trim();
    const status = normalizeWhatsAppDeliveryStatus(String(data?.status || ""));
    const ts = data?.timestamp ? new Date(String(data.timestamp)).toISOString() : undefined;
    if (messageId && status) return { messageId, status, timestampIso: ts };
  }

  if (event === "message.ack" || event === "message_ack" || event === "ack") {
    const data = (body.data || body.body || body.payload) as Record<string, unknown> | undefined;
    const messageId = String(data?.id || data?.message_id || data?.messageId || "").trim();
    const ack = Number(data?.ack ?? data?.acknowledgment ?? data?.acknowledgement);
    if (!messageId || !Number.isFinite(ack)) return null;
    if (ack >= 3) return { messageId, status: "read" };
    if (ack === 2) return { messageId, status: "delivered" };
    if (ack === 1) return { messageId, status: "sent" };
    if (ack <= -1) {
      return {
        messageId,
        status: "failed",
        errorMessage: String(data?.error || data?.message || "Delivery failed"),
      };
    }
    return null;
  }

  const flatId = String(body.message_id || body.messageId || body.msgId || "").trim();
  const flatStatus = normalizeWhatsAppDeliveryStatus(
    String(body.status || body.message_status || body.delivery_status || ""),
  );
  if (flatId && flatStatus && WHATSAPP_STATUS_RANK[flatStatus] !== undefined) {
    return { messageId: flatId, status: flatStatus };
  }

  const msg = body.message as Record<string, unknown> | undefined;
  if (msg && !(body.response as Record<string, unknown> | undefined)?.messages) {
    const messageId = String(msg.queue_id || msg.id || msg.message_id || msg.messageId || "").trim();
    const status = normalizeWhatsAppDeliveryStatus(
      String(msg.message_status || msg.status || ""),
    );
    if (messageId && WHATSAPP_STATUS_RANK[status] !== undefined) {
      return { messageId, status };
    }
  }

  const data = body.data as Record<string, unknown> | undefined;
  if (data && !event) {
    const messageId = String(data.message_id || data.messageId || data.id || "").trim();
    const status = normalizeWhatsAppDeliveryStatus(String(data.status || ""));
    if (messageId && status && WHATSAPP_STATUS_RANK[status] !== undefined) {
      return { messageId, status };
    }
  }

  return null;
}
