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

/** Normalize provider base URL (trim, lowercase scheme, no trailing slash). */
export function normalizeWhatsAppApiBaseUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized) return "";

  if (/^https?:\/\//i.test(normalized)) {
    normalized = normalized.replace(/^https?:\/\//i, (m) => m.toLowerCase());
  } else {
    normalized = `https://${normalized}`;
  }

  return normalized.replace(/\/+$/, "");
}

/** Base URL for Graph-style API calls. */
export function resolveWhatsAppApiBaseUrl(settings: WhatsAppApiSettingsLike): string {
  const provider = settings.api_provider || "meta_direct";

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
  const version = (settings.api_version || "v21.0").trim().replace(/^\/+/, "");
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
  return !!resolveWabaIdForTemplates(settings);
}
