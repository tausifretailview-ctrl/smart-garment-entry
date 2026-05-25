/** Normalize token pasted from provider dashboards (trim, strip accidental "Bearer " prefix). */
export function normalizeWhatsAppAccessToken(raw: string | null | undefined): string {
  if (!raw) return "";
  let token = String(raw).trim().replace(/\s+/g, "");
  if (/^bearer/i.test(token)) {
    token = token.replace(/^bearer/i, "").trim();
  }
  return token;
}

export function buildWhatsAppAuthHeaders(accessToken: string): Record<string, string> {
  const token = normalizeWhatsAppAccessToken(accessToken);
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/** Parse Meta Graph or BSP wrapper errors (e.g. WappConnect `{ error: "unauthorized access", success: false }`). */
export function parseWhatsAppProviderError(
  data: unknown,
  httpStatus?: number,
  fallback = "Request failed",
): string {
  if (!data || typeof data !== "object") {
    return httpStatus === 401
      ? "Unauthorized (401). Access token is invalid or expired — paste a fresh token from your provider dashboard and Save."
      : fallback;
  }

  const body = data as Record<string, unknown>;

  if (typeof body.error === "string" && body.error.trim()) {
    const msg = body.error.trim();
    if (httpStatus === 401 || /unauthorized/i.test(msg)) {
      return `${msg}. Update Access Token in WhatsApp settings (copy from WappConnect — do not add "Bearer " prefix).`;
    }
    return msg;
  }

  const nested = body.error as Record<string, unknown> | undefined;
  if (nested && typeof nested.message === "string" && nested.message.trim()) {
    return nested.message.trim();
  }

  if (typeof body.message === "string" && body.message.trim()) {
    return body.message.trim();
  }

  if (httpStatus === 401) {
    return "Unauthorized (401). Access token is invalid or expired — get a new token from your provider and Save settings.";
  }

  return fallback;
}
