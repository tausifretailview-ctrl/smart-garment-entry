import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildWhatsAppAuthHeaders,
  normalizeWhatsAppAccessToken,
  parseWhatsAppProviderError,
} from "../_shared/whatsappAuth.ts";
import { normalizeWhatsAppApiBaseUrl, normalizeWhatsAppApiVersion } from "../_shared/whatsappUrl.ts";
import {
  OFFICIAL_META_INVOICE_TEMPLATE_LANGUAGE,
  OFFICIAL_META_INVOICE_TEMPLATE_NAME,
  buildOfficialMetaInvoiceTemplateComponents,
  buildOfficialMetaInvoiceTemplateCreateBody,
  isDuplicateWhatsAppTemplateError,
  officialMetaInvoiceTemplateIsReady,
  replaceTemplateLogoWithShopDetails,
} from "../_shared/officialMetaInvoiceTemplate.ts";

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
};

function resolveBaseUrl(settings: OrgWhatsAppSettings): string {
  const custom = settings.custom_api_url?.trim();
  if (!custom) {
    throw new Error("Third-party API URL is not configured. Save WhatsApp settings with Custom API URL.");
  }
  return normalizeWhatsAppApiBaseUrl(custom);
}

function resolveWabaId(settings: OrgWhatsAppSettings): string {
  return settings.waba_id?.trim() || settings.business_id?.trim() || "";
}

function orgCanSubmit(settings: OrgWhatsAppSettings | null): boolean {
  if (!settings) return false;
  if (!normalizeWhatsAppAccessToken(settings.access_token)) return false;
  if (!resolveWabaId(settings)) return false;
  if (!settings.custom_api_url?.trim()) return false;
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const organizationId = typeof body?.organizationId === "string" ? body.organizationId.trim() : "";
    const templateName = typeof body?.templateName === "string" ? body.templateName.trim() : "";
    const replaceLogoWithShopDetails = body?.replaceLogoWithShopDetails === true;
    if (!organizationId) {
      return new Response(JSON.stringify({ success: false, error: "organizationId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userError } = await authClient.auth.getUser();
    const caller = userData?.user;
    if (userError || !caller) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", caller.id)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership || !["admin", "manager"].includes(String(membership.role))) {
      return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: orgSettings, error: settingsError } = await supabase
      .from("whatsapp_api_settings")
      .select(
        "api_provider, custom_api_url, api_version, waba_id, business_id, access_token, use_default_api, is_active",
      )
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (settingsError) throw settingsError;

    let credentials: OrgWhatsAppSettings | null = null;
    const useOrgCredentials = orgSettings?.use_default_api !== true && orgCanSubmit(orgSettings);

    if (!useOrgCredentials) {
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
        api_provider: "third_party",
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

    const accessToken = normalizeWhatsAppAccessToken(credentials?.access_token);
    if (!accessToken) throw new Error("WhatsApp access token is not configured");

    const baseUrl = resolveBaseUrl(credentials);
    const version = normalizeWhatsAppApiVersion(credentials.api_version);
    const wabaId = resolveWabaId(credentials);
    if (!wabaId) throw new Error("WhatsApp Business Account ID (WABA ID) is required.");

    const headers = buildWhatsAppAuthHeaders(accessToken);

    if (replaceLogoWithShopDetails) {
      if (!/^[a-z0-9_]{1,512}$/.test(templateName)) {
        return new Response(JSON.stringify({ success: false, error: "A valid templateName is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: companySettings, error: companyError } = await supabase
        .from("settings")
        .select("business_name, address")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (companyError) throw companyError;
      if (!companySettings?.business_name || !companySettings?.address) {
        throw new Error("Save the shop name and address in Company Profile before updating the template.");
      }

      const customListUrl =
        `${baseUrl}/${version}/${wabaId}/message_templates?name=${encodeURIComponent(templateName)}&limit=20`;
      const customListRes = await fetch(customListUrl, { headers });
      const customListData = await customListRes.json().catch(() => ({}));
      if (!customListRes.ok) {
        throw new Error(parseWhatsAppProviderError(customListData, customListRes.status, "Failed to read WhatsApp template"));
      }
      const existingTemplate = Array.isArray(customListData?.data) ? customListData.data[0] : null;
      if (!existingTemplate?.id) {
        throw new Error(`Template ${templateName} was not found in the connected WhatsApp account.`);
      }

      const updatedComponents = replaceTemplateLogoWithShopDetails(existingTemplate.components, {
        businessName: companySettings.business_name,
        address: companySettings.address,
      });
      const editRes = await fetch(`${baseUrl}/${version}/${existingTemplate.id}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ components: updatedComponents }),
      });
      const editData = await editRes.json().catch(() => ({}));
      if (!editRes.ok) {
        throw new Error(parseWhatsAppProviderError(editData, editRes.status, "Failed to update WhatsApp template"));
      }

      const submittedStatus = String(editData?.status ?? "PENDING").toUpperCase();
      await supabase.from("whatsapp_meta_templates").upsert(
        {
          organization_id: organizationId,
          template_name: templateName,
          template_category: existingTemplate.category || "MARKETING",
          template_language: existingTemplate.language || "en",
          template_status: submittedStatus,
          components: updatedComponents,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,template_name,template_language" },
      );

      return new Response(JSON.stringify({
        success: true,
        action: "updated",
        status: submittedStatus,
        templateName,
        templateId: String(existingTemplate.id),
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const listUrl =
      `${baseUrl}/${version}/${wabaId}/message_templates?name=${encodeURIComponent(OFFICIAL_META_INVOICE_TEMPLATE_NAME)}&limit=20`;
    const listRes = await fetch(listUrl, { headers });
    const listData = await listRes.json().catch(() => ({}));
    if (!listRes.ok) {
      throw new Error(parseWhatsAppProviderError(listData, listRes.status, "Failed to read WhatsApp templates"));
    }

    const existing = Array.isArray(listData?.data)
      ? listData.data.find((row: { language?: string }) =>
        row?.language === OFFICIAL_META_INVOICE_TEMPLATE_LANGUAGE || row?.language === "en"
      ) || listData.data[0]
      : null;

    const components = buildOfficialMetaInvoiceTemplateComponents();
    let action: "created" | "updated" | "unchanged" = "unchanged";
    let status = String(existing?.status ?? "");
    let templateId = existing?.id ? String(existing.id) : "";
    let savedComponents = existing?.components ?? components;

    if (!existing) {
      const createRes = await fetch(`${baseUrl}/${version}/${wabaId}/message_templates`, {
        method: "POST",
        headers,
        body: JSON.stringify(buildOfficialMetaInvoiceTemplateCreateBody()),
      });
      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        const message = parseWhatsAppProviderError(createData, createRes.status, "Failed to create invoice template");
        if (!isDuplicateWhatsAppTemplateError(message)) {
          throw new Error(message);
        }
      } else {
        action = "created";
        status = String(createData?.status ?? "PENDING");
        templateId = String(createData?.id ?? "");
        savedComponents = components;
      }
    } else if (!officialMetaInvoiceTemplateIsReady(existing)) {
      if (!templateId) {
        throw new Error("WhatsApp did not return a template id. Click Sync Templates, then try again.");
      }
      const editRes = await fetch(`${baseUrl}/${version}/${templateId}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ components }),
      });
      const editData = await editRes.json().catch(() => ({}));
      if (!editRes.ok) {
        throw new Error(parseWhatsAppProviderError(editData, editRes.status, "Failed to update invoice template"));
      }
      action = "updated";
      // An edit goes back to review. Do not keep the previous APPROVED flag.
      status = String(editData?.status ?? "PENDING");
      savedComponents = components;
    }

    const ready = officialMetaInvoiceTemplateIsReady({ status, components: savedComponents });

    if (ready) {
      await supabase.from("whatsapp_meta_templates").upsert(
        {
          organization_id: organizationId,
          template_name: OFFICIAL_META_INVOICE_TEMPLATE_NAME,
          template_category: "UTILITY",
          template_language: existing?.language || OFFICIAL_META_INVOICE_TEMPLATE_LANGUAGE,
          template_status: "APPROVED",
          components: savedComponents,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,template_name,template_language" },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        action,
        ready,
        status: status || (ready ? "APPROVED" : "PENDING"),
        templateName: OFFICIAL_META_INVOICE_TEMPLATE_NAME,
        templateId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit invoice template";
    console.error("submit-whatsapp-invoice-template:", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
