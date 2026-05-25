/** Shared WhatsApp API auth helpers for edge functions. */

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

export function parseWhatsAppProviderError(
  data: unknown,
  httpStatus?: number,
  fallback = "Request failed",
): string {
  if (!data || typeof data !== "object") {
    return httpStatus === 401
      ? "Unauthorized (401). Access token is invalid or expired."
      : fallback;
  }

  const body = data as Record<string, unknown>;

  if (typeof body.error === "string" && body.error.trim()) {
    return body.error.trim();
  }

  const nested = body.error as Record<string, unknown> | undefined;
  if (nested && typeof nested.message === "string" && nested.message.trim()) {
    return nested.message.trim();
  }

  if (typeof body.message === "string" && body.message.trim()) {
    return body.message.trim();
  }

  if (httpStatus === 401) {
    return "Unauthorized (401). Access token is invalid or expired.";
  }

  return fallback;
}
