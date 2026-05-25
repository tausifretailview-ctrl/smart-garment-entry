/** Shared WhatsApp API URL helpers (Meta direct + third-party proxies e.g. WappConnect). */

export type WhatsAppApiSettingsLike = {
  api_provider?: string | null;
  custom_api_url?: string | null;
  api_version?: string | null;
  waba_id?: string | null;
  business_id?: string | null;
  access_token?: string | null;
};

export function isThirdPartyWhatsAppProvider(apiProvider?: string | null): boolean {
  return apiProvider === "third_party";
}

/** Normalize provider base URL (lowercase scheme/host/path, no trailing slash). */
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

/** Normalize API version label (e.g. V21.0 → v21.0). */
export function normalizeWhatsAppApiVersion(raw: string | null | undefined): string {
  const v = (raw || "v21.0").trim().replace(/^\/+/, "");
  return v.toLowerCase();
}

/** Base URL for Graph-style API calls. */
export function resolveWhatsAppApiBaseUrl(settings: WhatsAppApiSettingsLike): string {
  const provider = settings.api_provider || "third_party";

  if (isThirdPartyWhatsAppProvider(provider)) {
    const custom = settings.custom_api_url?.trim();
    if (!custom) {
      throw new Error(
        "Third-party API URL is required. Enter your provider base URL (e.g. https://crmapi.wappconnect.com/api/meta) and save settings.",
      );
    }
    return normalizeWhatsAppApiBaseUrl(custom);
  }

  const custom = settings.custom_api_url?.trim();
  if (custom) return normalizeWhatsAppApiBaseUrl(custom);
  return "https://graph.facebook.com";
}

/**
 * WABA ID for listing message templates.
 * Third-party dashboards often expose this as "Business ID" instead of WABA ID.
 */
export function resolveWabaIdForTemplates(settings: WhatsAppApiSettingsLike): string {
  const waba = settings.waba_id?.trim() || "";
  const businessId = settings.business_id?.trim() || "";
  return waba || businessId;
}

export function buildMessageTemplatesListUrl(
  settings: WhatsAppApiSettingsLike,
  extraQuery?: Record<string, string>,
): string {
  const baseUrl = resolveWhatsAppApiBaseUrl(settings);
  const version = normalizeWhatsAppApiVersion(settings.api_version);
  const wabaId = resolveWabaIdForTemplates(settings);

  if (!wabaId) {
    throw new Error(
      isThirdPartyWhatsAppProvider(settings.api_provider)
        ? "WhatsApp Business Account ID or Business ID is required. Third-party providers often use Business ID for template sync."
        : "WhatsApp Business Account ID (WABA ID) is required for template sync.",
    );
  }

  const params = new URLSearchParams({
    fields: "name,status,category,language,components",
    ...extraQuery,
  });

  return `${baseUrl}/${version}/${wabaId}/message_templates?${params.toString()}`;
}

export function canSyncWhatsAppTemplates(settings: WhatsAppApiSettingsLike | null | undefined): boolean {
  if (!settings?.access_token?.trim()) return false;
  if (!resolveWabaIdForTemplates(settings)) return false;
  if (isThirdPartyWhatsAppProvider(settings.api_provider) && !settings.custom_api_url?.trim()) {
    return false;
  }
  return true;
}
