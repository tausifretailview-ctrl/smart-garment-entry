import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { gatewayRequest, getGatewayConfig } from "../_shared/builtinGatewaySend.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const VALID_STATUS = new Set(["connected", "connecting", "qr", "disconnected", "logged_out"]);

/**
 * Browser -> gateway control plane for "Our WhatsApp" (start/QR, status, logout), authorized
 * per org (admin/manager). The gateway posts connection events back with x-api-key.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const action = String(body.action ?? "");
  const organizationId = String(body.organizationId ?? "").trim();
  if (!organizationId) return json({ error: "organizationId is required" }, 400);

  // ---- Gateway -> app connection event (shared secret) ----
  if (action === "gateway-event") {
    const cfg = getGatewayConfig();
    if (!cfg || req.headers.get("x-api-key") !== cfg.key) return json({ error: "Unauthorized" }, 401);
    const status = String(body.status ?? "");
    if (!VALID_STATUS.has(status)) return json({ error: "Invalid status" }, 400);
    const number = body.connectedNumber ? String(body.connectedNumber).replace(/\D/g, "") : null;
    const update: Record<string, unknown> = { builtin_status: status, updated_at: new Date().toISOString() };
    if (status === "connected" && number) update.builtin_connected_number = number;
    if (status === "logged_out") update.builtin_connected_number = null;
    const { error } = await supabaseAdmin
      .from("whatsapp_api_settings")
      .update(update)
      .eq("organization_id", organizationId);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  // ---- Browser -> gateway (user JWT + org role) ----
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Unauthorized" }, 401);
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) return json({ error: "Unauthorized" }, 401);

  for (const role of ["admin", "manager"]) {
    const { data: ok } = await supabaseAdmin.rpc("has_org_role", {
      user_id: userId,
      org_id: organizationId,
      required_role: role,
    });
    if (ok === true) {
      return await handleControl(supabaseAdmin, action, organizationId);
    }
  }
  return json({ error: "Not authorized for this organization" }, 403);
});

async function handleControl(
  supabaseAdmin: SupabaseClient,
  action: string,
  organizationId: string,
): Promise<Response> {
  const base = `/sessions/${encodeURIComponent(organizationId)}`;
  let result;
  if (action === "start") {
    result = await gatewayRequest(`${base}/start`, { method: "POST" });
  } else if (action === "status") {
    result = await gatewayRequest(`${base}/status`);
  } else if (action === "logout") {
    result = await gatewayRequest(base, { method: "DELETE" });
    if (result.ok) {
      await supabaseAdmin
        .from("whatsapp_api_settings")
        .update({ builtin_status: "logged_out", builtin_connected_number: null })
        .eq("organization_id", organizationId);
    }
  } else {
    return json({ error: "Unknown action" }, 400);
  }

  if (!result.ok) return json({ error: result.data.error ?? "Gateway error" }, result.status || 502);

  const status = String(result.data.status ?? "");
  if (action !== "logout" && VALID_STATUS.has(status)) {
    const update: Record<string, unknown> = { builtin_status: status };
    if (status === "connected" && result.data.connectedNumber) {
      update.builtin_connected_number = String(result.data.connectedNumber).replace(/\D/g, "");
    }
    await supabaseAdmin.from("whatsapp_api_settings").update(update).eq("organization_id", organizationId);
  }
  return json({ success: true, ...result.data });
}
