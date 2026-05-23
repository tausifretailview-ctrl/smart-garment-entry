import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type OrgWhatsAppSettings = {
  api_provider?: string | null;
  custom_api_url?: string | null;
  api_version?: string | null;
  waba_id?: string | null;
  business_id?: string | null;
  access_token?: string | null;
  use_default_api?: boolean | null;
  is_active?: boolean | null;
  phone_number_id?: string | null;
};

function isThirdParty(apiProvider?: string | null): boolean {
  return apiProvider === "third_party";
}

function normalizeBaseUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized) return "";
  if (/^https?:\/\//i.test(normalized)) {
    normalized = normalized.replace(/^https?:\/\//i, (m) => m.toLowerCase());
  } else {
    normalized = `https://${normalized}`;
  }
  return normalized.replace(/\/+$/, "");
}

function resolveBaseUrl(settings: OrgWhatsAppSettings): string {
  const provider = settings.api_provider || "meta_direct";
  if (isThirdParty(provider)) {
    const custom = settings.custom_api_url?.trim();
    if (!custom) {
      throw new Error("Third-party API URL is not configured.");
    }
    return normalizeBaseUrl(custom);
  }
  const custom = settings.custom_api_url?.trim();
  if (custom) return normalizeBaseUrl(custom);
  return "https://graph.facebook.com";
}

function resolveWabaId(settings: OrgWhatsAppSettings): string {
  return (settings.waba_id?.trim() || settings.business_id?.trim() || "");
}

function buildTemplatesUrl(settings: OrgWhatsAppSettings): string {
  const baseUrl = resolveBaseUrl(settings);
  const version = (settings.api_version || "v21.0").trim().replace(/^\/+/, "");
  const wabaId = resolveWabaId(settings);
  if (!wabaId) {
    throw new Error(
      isThirdParty(settings.api_provider)
        ? "Business ID or WhatsApp Business Account ID is required."
        : "WhatsApp Business Account ID (WABA ID) is required.",
    );
  }
  const params = new URLSearchParams({
    fields: "name,status,category,language,components",
  });
  return `${baseUrl}/${version}/${wabaId}/message_templates?${params.toString()}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { organizationId } = await req.json();
    if (!organizationId) {
      return new Response(JSON.stringify({ success: false, error: "organizationId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: orgSettings, error: settingsError } = await supabase
      .from("whatsapp_api_settings")
      .select(
        "api_provider, custom_api_url, api_version, waba_id, business_id, access_token, use_default_api, is_active, phone_number_id",
      )
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (settingsError) throw settingsError;

    let credentials: OrgWhatsAppSettings | null = null;

    const useDefaultApi = orgSettings?.use_default_api !== false;
    const hasOwnCreds = orgSettings?.phone_number_id && orgSettings?.access_token;

    if (useDefaultApi || !hasOwnCreds) {
      const { data: platformSettings, error: platformError } = await supabase
        .from("platform_settings")
        .select("setting_value")
        .eq("setting_key", "default_whatsapp_api")
        .single();

      if (platformError || !platformSettings) {
        throw new Error("Platform default WhatsApp API not configured");
      }

      const defaultCreds = platformSettings.setting_value as OrgWhatsAppSettings;
      credentials = {
        api_provider: defaultCreds.api_provider || "meta_direct",
        custom_api_url: defaultCreds.custom_api_url,
        api_version: defaultCreds.api_version || "v21.0",
        waba_id: defaultCreds.waba_id,
        business_id: defaultCreds.business_id,
        access_token: defaultCreds.access_token,
      };
    } else {
      if (!orgSettings?.is_active) {
        throw new Error("WhatsApp API integration is disabled for this organization");
      }
      credentials = orgSettings;
    }

    if (!credentials?.access_token?.trim()) {
      throw new Error("WhatsApp access token is not configured");
    }

    const templatesUrl = buildTemplatesUrl(credentials);
    const providerLabel = isThirdParty(credentials.api_provider) ? "third-party provider" : "Meta";

    console.log(`Syncing templates via ${providerLabel}: ${templatesUrl.replace(credentials.access_token!, "***")}`);

    const response = await fetch(templatesUrl, {
      headers: { Authorization: `Bearer ${credentials.access_token}` },
    });

    const data = await response.json();

    if (!response.ok) {
      const msg =
        data?.error?.message ||
        data?.message ||
        `Failed to fetch templates from ${providerLabel} (${response.status})`;
      throw new Error(msg);
    }

    const templates = data.data || [];
    const approvedTemplates = templates.filter((t: { status?: string }) => t.status === "APPROVED");

    for (const template of approvedTemplates) {
      await supabase.from("whatsapp_meta_templates").upsert(
        {
          organization_id: organizationId,
          template_name: template.name,
          template_category: template.category,
          template_language: template.language,
          template_status: template.status,
          components: template.components,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,template_name,template_language" },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: approvedTemplates.length,
        provider: credentials.api_provider || "meta_direct",
        apiBase: resolveBaseUrl(credentials),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("sync-whatsapp-templates error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync templates",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
