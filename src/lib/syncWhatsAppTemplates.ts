import { supabase } from "@/integrations/supabase/client";
import {
  buildWhatsAppAuthHeaders,
  normalizeWhatsAppAccessToken,
  parseWhatsAppProviderError,
} from "@/lib/whatsappApiAuth";
import {
  buildMessageTemplatesListUrl,
  isThirdPartyWhatsAppProvider,
  type WhatsAppApiSettingsLike,
} from "@/lib/whatsappApiUrl";

export type WhatsAppTemplateSyncSettings = WhatsAppApiSettingsLike & {
  access_token: string;
};

type MetaTemplateRow = {
  name: string;
  status?: string;
  category?: string;
  language?: string;
  components?: unknown;
};

/** Read error body from supabase.functions.invoke when the edge function returns 4xx/5xx. */
export async function parseEdgeFunctionInvokeError(error: unknown): Promise<string> {
  if (!error || typeof error !== "object") {
    return "Failed to sync templates";
  }

  const err = error as { message?: string; context?: Response };
  if (err.context && typeof err.context.json === "function") {
    try {
      const body = await err.context.json();
      if (typeof body?.error === "string" && body.error.trim()) {
        return body.error;
      }
    } catch {
      /* ignore parse errors */
    }
  }

  const msg = err.message || "";
  if (/failed to send a request to the edge function/i.test(msg)) {
    return (
      "Template sync service could not be reached. Syncing directly from your API provider instead. " +
      "If this keeps failing, save WhatsApp settings and check Custom API URL, WABA/Business ID, and access token."
    );
  }

  return msg || "Failed to sync templates";
}

export function isEdgeFunctionUnreachableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const msg = String((error as { message?: string }).message || "");
  return /failed to send a request to the edge function/i.test(msg) || /\b404\b/.test(msg);
}

/**
 * Fetch approved templates from Meta or a third-party Graph proxy (e.g. WappConnect)
 * and upsert into whatsapp_meta_templates.
 */
export async function syncWhatsAppTemplatesFromProvider(
  organizationId: string,
  settings: WhatsAppTemplateSyncSettings,
): Promise<{ count: number; provider: string }> {
  const token = normalizeWhatsAppAccessToken(settings.access_token);
  if (!token) {
    throw new Error("WhatsApp access token is not configured. Save settings first.");
  }

  const url = buildMessageTemplatesListUrl(settings);
  const providerLabel = isThirdPartyWhatsAppProvider(settings.api_provider)
    ? "third-party provider"
    : "Meta";

  const response = await fetch(url, {
    headers: buildWhatsAppAuthHeaders(token),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const apiMsg = parseWhatsAppProviderError(data, response.status, `HTTP ${response.status}`);
    throw new Error(
      `Failed to fetch templates from ${providerLabel}: ${apiMsg} ` +
        (isThirdPartyWhatsAppProvider(settings.api_provider)
          ? "(Check Custom API URL, WhatsApp Business Account ID, and a fresh Access Token from WappConnect.)"
          : "(Check WABA ID and access token.)"),
    );
  }

  const templates = ((data as { data?: MetaTemplateRow[] }).data || []) as MetaTemplateRow[];
  const approvedTemplates = templates.filter((t) => t.status === "APPROVED");

  const syncedKeys = new Set<string>();
  for (const template of approvedTemplates) {
    const language = template.language || "en";
    syncedKeys.add(`${template.name}\0${language}`);
    const { error } = await supabase.from("whatsapp_meta_templates").upsert(
      {
        organization_id: organizationId,
        template_name: template.name,
        template_category: template.category,
        template_language: language,
        template_status: template.status,
        components: template.components as any,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "organization_id,template_name,template_language" },
    );

    if (error) throw error;
  }

  const removed = await pruneStaleWhatsAppTemplates(organizationId, syncedKeys);

  return {
    count: approvedTemplates.length,
    removed,
    provider: settings.api_provider || "third_party",
  };
}

/** Remove templates no longer returned by the provider (e.g. after switching accounts). */
export async function pruneStaleWhatsAppTemplates(
  organizationId: string,
  syncedKeys: Set<string>,
): Promise<number> {
  const { data: existingRows, error: fetchError } = await supabase
    .from("whatsapp_meta_templates")
    .select("id, template_name, template_language")
    .eq("organization_id", organizationId);

  if (fetchError) throw fetchError;
  if (!existingRows?.length) return 0;

  const staleIds = existingRows
    .filter((row) => !syncedKeys.has(`${row.template_name}\0${row.template_language || "en"}`))
    .map((row) => row.id);

  if (staleIds.length === 0) return 0;

  const { error: deleteError } = await supabase
    .from("whatsapp_meta_templates")
    .delete()
    .in("id", staleIds);

  if (deleteError) throw deleteError;
  return staleIds.length;
}
