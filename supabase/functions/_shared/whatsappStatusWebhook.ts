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
    updatePayload.error_message = errorMessage?.trim() || "Delivery failed";
  }
  return updatePayload;
}

function collectMetaGraphStatusErrors(source: Record<string, unknown>): unknown[] {
  const extra: unknown[] = [];
  const pushStatusErrors = (statuses: unknown) => {
    if (!Array.isArray(statuses)) return;
    for (const st of statuses) {
      if (!st || typeof st !== "object") continue;
      const rec = st as Record<string, unknown>;
      if (Array.isArray(rec.errors)) extra.push(...rec.errors);
      if (rec.error) extra.push(rec.error);
    }
  };

  pushStatusErrors(source.statuses);
  const value = source.value;
  if (value && typeof value === "object") {
    pushStatusErrors((value as Record<string, unknown>).statuses);
  }

  const entries = source.entry;
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const changes = (entry as Record<string, unknown>).changes;
      if (!Array.isArray(changes)) continue;
      for (const change of changes) {
        if (!change || typeof change !== "object") continue;
        const chVal = (change as Record<string, unknown>).value;
        if (chVal && typeof chVal === "object") {
          pushStatusErrors((chVal as Record<string, unknown>).statuses);
        }
      }
    }
  }
  return extra;
}

/** Pull a human-readable delivery error from Meta / third-party BSP webhook bodies. */
export function extractWhatsAppDeliveryError(source: Record<string, unknown>): string {
  const msg = source.message as Record<string, unknown> | undefined;
  const statusObj = source.status as Record<string, unknown> | undefined;
  const nestedCallback =
    source.delivery_callback && typeof source.delivery_callback === "object"
      ? (source.delivery_callback as Record<string, unknown>)
      : undefined;
  const candidates: unknown[] = [
    msg?.error_message,
    msg?.error,
    source.error_message,
    source.error,
    ...collectMetaGraphStatusErrors(source),
    ...(nestedCallback ? collectMetaGraphStatusErrors(nestedCallback) : []),
  ];

  const statusErrors = statusObj?.errors;
  if (Array.isArray(statusErrors)) {
    candidates.push(...statusErrors);
  }
  const topErrors = source.errors;
  if (Array.isArray(topErrors)) {
    candidates.push(...topErrors);
  }

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
    if (candidate && typeof candidate === "object") {
      const obj = candidate as Record<string, unknown>;
      const errData =
        obj.error_data && typeof obj.error_data === "object"
          ? (obj.error_data as Record<string, unknown>)
          : undefined;
      const text = String(
        obj.message ??
          obj.title ??
          obj.error_user_msg ??
          obj.details ??
          obj.reason ??
          errData?.details ??
          "",
      ).trim();
      if (text) {
        const code = obj.code != null ? ` (${obj.code})` : "";
        return `${text}${code}`;
      }
    }
  }

  return "";
}

/** Third-party BSP (e.g. crmapi.wappconnect.com) may return queue_id + queued even when HTTP status is non-2xx. */
export function isBspSendAccepted(
  responseData: Record<string, unknown> | null | undefined,
  httpOk: boolean,
): boolean {
  if (!responseData || typeof responseData !== "object") return httpOk;

  const metaId = (responseData.messages as Array<{ id?: string }> | undefined)?.[0]?.id;
  if (metaId) return true;

  const msg = responseData.message as Record<string, unknown> | undefined;
  const queueId = msg?.queue_id;
  const msgStatus = String(msg?.message_status || msg?.status || "").trim().toLowerCase();

  if (msgStatus === "failed" || msgStatus === "error") return false;
  if (queueId && (msgStatus === "queued" || msgStatus === "sent" || msgStatus === "")) {
    return true;
  }

  return httpOk && !responseData.error;
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
