type WhatsAppLogLike = {
  status: string;
  provider?: string | null;
  provider_response?: unknown;
  error_message?: string | null;
  read_at?: string | null;
  delivered_at?: string | null;
};

function isProviderFailureStatus(status: unknown): boolean {
  if (status === null || status === undefined || status === "") return false;

  const normalized = String(status).trim().toLowerCase();
  if (normalized === "error" || normalized === "fail" || normalized === "failed" || normalized === "failure") {
    return true;
  }

  const numeric = Number(status);
  return Number.isFinite(numeric) && numeric >= 400;
}

/** Detect WappConnect failures stored inside provider_response (HTTP 200 + status 400). */
export function getWappConnectProviderError(providerResponse?: unknown): string | undefined {
  if (!providerResponse || typeof providerResponse !== "object") return undefined;

  const obj = providerResponse as Record<string, unknown>;
  const nested = obj.data;
  if (nested && typeof nested === "object") {
    const data = nested as Record<string, unknown>;
    if (data.connStatus === false) {
      return String(data.message ?? data.error ?? "WappConnect instance is not connected").trim()
        || "WappConnect instance is not connected";
    }
  }

  if (obj.error !== undefined && obj.error !== null && obj.error !== "") {
    if (typeof obj.error === "string") return obj.error;
    if (typeof obj.error === "object") {
      const nested = obj.error as Record<string, unknown>;
      const nestedMsg = String(nested.message ?? nested.title ?? nested.description ?? "").trim();
      if (nestedMsg) return nestedMsg;
    }
  }

  const message = String(obj.message ?? obj.msg ?? "").trim();
  const providerStatus = obj.status ?? obj.statusCode;

  if (String(obj.success ?? "").toLowerCase() === "false") {
    return message || "WappConnect returned success=false";
  }

  if (isProviderFailureStatus(providerStatus)) {
    return message || `WappConnect returned status ${providerStatus}`;
  }

  return undefined;
}

/** Use provider_response to correct legacy rows; timestamps override stale status (WappConnect webhooks). */
export function getEffectiveWhatsAppLogStatus(log: WhatsAppLogLike): string {
  if (log.provider === "wappconnect") {
    const providerError = getWappConnectProviderError(log.provider_response);
    if (providerError || log.error_message) {
      return "failed";
    }
  }

  if (log.read_at) return "read";
  if (log.delivered_at) return "delivered";
  return log.status;
}

export function getWappConnectRequestUrl(providerResponse?: unknown): string | null {
  if (!providerResponse || typeof providerResponse !== "object") return null;
  const requestUrl = String((providerResponse as Record<string, unknown>).requestUrl ?? "").trim();
  return requestUrl || null;
}
