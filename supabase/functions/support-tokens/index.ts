import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { gatewayRequest, getGatewayConfig } from "../_shared/builtinGatewaySend.ts";
import {
  buildSupportTokenMessage,
  isSupportCategory,
  supportPhoneDigits,
} from "../_shared/supportTokenMessage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Ezzy's own support number on the bill wa-gateway (WA_GATEWAY_URL), linked from Platform Admin. */
const SUPPORT_SESSION = "/sessions/support";
const MAX_MESSAGE = 2000;
const MAX_PER_HOUR = 5;

type Admin = SupabaseClient;

/**
 * Support tokens. Any signed-in shop user: `create` saves a token and posts it to the Technical Support
 * WhatsApp group. Platform admins: link the support number (QR), pick the group, test, resend.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Unauthorized" }, 401);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const action = String(body.action ?? "");

  if (action === "create") return await createToken(admin, user, body);

  const { data: isPlatformAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "platform_admin" });
  if (isPlatformAdmin !== true) return json({ error: "Platform admin only" }, 403);

  switch (action) {
    case "admin-config":
      return await adminConfig(admin);
    case "admin-start": {
      const phone = body.phone ? String(body.phone).slice(0, 20) : undefined;
      return gatewayJson(await gatewayRequest(`${SUPPORT_SESSION}/start`, { method: "POST", body: phone ? { phone } : undefined }));
    }
    case "admin-logout":
      return gatewayJson(await gatewayRequest(SUPPORT_SESSION, { method: "DELETE" }));
    case "admin-groups":
      return gatewayJson(await gatewayRequest(`${SUPPORT_SESSION}/groups`));
    case "admin-save-group": {
      const jid = String(body.jid ?? "").trim();
      if (jid && !/^[0-9-]+@g\.us$/.test(jid)) return json({ error: "Invalid group" }, 400);
      const { error } = await admin
        .from("support_settings")
        .upsert({
          id: 1,
          whatsapp_group_jid: jid || null,
          whatsapp_group_name: jid ? String(body.name ?? "").slice(0, 200) || null : null,
          updated_at: new Date().toISOString(),
        });
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }
    case "admin-test": {
      const sent = await sendToGroup(admin, "✅ Ezzy ERP support tokens are connected. New tokens will be posted in this group.");
      return sent.ok ? json({ success: true }) : json({ error: sent.error }, 400);
    }
    case "admin-resend": {
      const id = String(body.tokenId ?? "");
      const { data: row, error } = await admin.from("support_tokens").select("*").eq("id", id).maybeSingle();
      if (error || !row) return json({ error: "Token not found" }, 404);
      const result = await sendToGroup(admin, alertFor(row));
      await saveWhatsAppResult(admin, id, result);
      return result.ok ? json({ success: true }) : json({ error: result.error }, 400);
    }
    default:
      return json({ error: "Unknown action" }, 400);
  }
});

async function createToken(
  admin: Admin,
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> },
  body: Record<string, unknown>,
): Promise<Response> {
  const organizationId = String(body.organizationId ?? "").trim();
  const message = String(body.message ?? "").trim().slice(0, MAX_MESSAGE);
  const phone = String(body.phone ?? "").trim().slice(0, 20);
  const category = isSupportCategory(body.category) ? body.category : "technical";
  if (!organizationId) return json({ error: "organizationId is required" }, 400);
  if (message.length < 5) return json({ error: "Please describe your doubt or issue" }, 400);
  if (!supportPhoneDigits(phone)) return json({ error: "Please enter a valid contact number" }, 400);

  const { data: membership } = await admin
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return json({ error: "Not a member of this organization" }, 403);

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("support_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_PER_HOUR) {
    return json({ error: "You have raised several tokens in the last hour. Our team will contact you soon." }, 429);
  }

  const { data: org } = await admin.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  const metaName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  const userName = String(body.userName ?? "").trim().slice(0, 100) || metaName || user.email?.split("@")[0] || "User";
  const pagePath = body.pagePath ? String(body.pagePath).slice(0, 200) : null;

  const { data: row, error } = await admin
    .from("support_tokens")
    .insert({
      organization_id: organizationId,
      organization_name: org?.name ?? null,
      user_id: user.id,
      user_name: userName,
      user_email: user.email ?? null,
      contact_phone: phone,
      category,
      message,
      page_path: pagePath,
    })
    .select("*")
    .single();
  if (error || !row) return json({ error: error?.message ?? "Could not save the token" }, 500);

  const result = await sendToGroup(admin, alertFor(row));
  await saveWhatsAppResult(admin, row.id, result);
  if (!result.ok) console.error(`[support-tokens] token #${row.token_no} not sent:`, result.error);

  // The token is saved either way; the shop only needs its number.
  return json({ success: true, tokenNo: row.token_no, id: row.id, whatsappSent: result.ok });
}

// deno-lint-ignore no-explicit-any
function alertFor(row: any): string {
  return buildSupportTokenMessage({
    tokenNo: row.token_no,
    shopName: row.organization_name || "Unknown shop",
    userName: row.user_name || "User",
    userEmail: row.user_email,
    phone: row.contact_phone,
    category: isSupportCategory(row.category) ? row.category : "other",
    message: row.message,
    pagePath: row.page_path,
    createdAt: new Date(row.created_at),
  });
}

type SendResult = { ok: true } | { ok: false; error: string; notConfigured?: boolean };

async function sendToGroup(admin: Admin, message: string): Promise<SendResult> {
  if (!getGatewayConfig()) return { ok: false, error: "WhatsApp server is not configured", notConfigured: true };
  const { data: settings } = await admin.from("support_settings").select("whatsapp_group_jid").eq("id", 1).maybeSingle();
  const jid = settings?.whatsapp_group_jid;
  if (!jid) return { ok: false, error: "Support WhatsApp group is not selected", notConfigured: true };
  const res = await gatewayRequest(`${SUPPORT_SESSION}/send-text`, { method: "POST", body: { phone: jid, message } });
  if (!res.ok) {
    const error = String(res.data.error ?? `Gateway error ${res.status}`);
    return { ok: false, error, notConfigured: /not connected|invalid session/i.test(error) };
  }
  return { ok: true };
}

async function saveWhatsAppResult(admin: Admin, id: string, result: SendResult) {
  await admin
    .from("support_tokens")
    .update({
      whatsapp_status: result.ok ? "sent" : result.notConfigured ? "not_configured" : "failed",
      whatsapp_error: result.ok ? null : result.error.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

async function adminConfig(admin: Admin): Promise<Response> {
  const { data: settings } = await admin
    .from("support_settings")
    .select("whatsapp_group_jid, whatsapp_group_name")
    .eq("id", 1)
    .maybeSingle();
  const group = { jid: settings?.whatsapp_group_jid ?? null, name: settings?.whatsapp_group_name ?? null };
  if (!getGatewayConfig()) return json({ configured: false, session: null, group });
  const res = await gatewayRequest(`${SUPPORT_SESSION}/status`);
  return json({ configured: true, session: res.ok ? res.data : { status: "unreachable", error: res.data.error }, group });
}

function gatewayJson(res: { ok: boolean; status: number; data: Record<string, unknown> }): Response {
  if (!res.ok) return json({ error: res.data.error ?? "Gateway error" }, res.status || 502);
  return json({ success: true, ...res.data });
}
