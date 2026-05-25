/** URL/version normalization for edge functions (must match src/lib/whatsappApiUrl.ts). */

export function normalizeWhatsAppApiBaseUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized) return "";

  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  try {
    const parsed = new URL(normalized);
    const protocol = parsed.protocol.toLowerCase();
    const host = parsed.hostname.toLowerCase();
    const port =
      parsed.port &&
      !((protocol === "https:" && parsed.port === "443") || (protocol === "http:" && parsed.port === "80"))
        ? `:${parsed.port}`
        : "";
    let path = parsed.pathname.replace(/\/+$/, "");
    if (path && path !== "/") {
      path = path.toLowerCase();
    } else {
      path = "";
    }
    return `${protocol}//${host}${port}${path}`;
  } catch {
    return normalized.toLowerCase().replace(/\/+$/, "");
  }
}

export function normalizeWhatsAppApiVersion(raw: string | null | undefined): string {
  const v = (raw || "v21.0").trim().replace(/^\/+/, "");
  return v.toLowerCase();
}
