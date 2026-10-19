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
 * Browser -> gateway control plane for "Ezzy ERP WhatsApp" (start/QR, status, logout), authorized
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

  // Settings page: show "Ezzy ERP WhatsApp" only when the gateway server is set up and answering.
  if (action === "config") {
    const cfg = getGatewayConfig();
    if (!cfg) return json({ configured: false, reachable: false });
    try {
      const res = await fetch(`${cfg.url}/health`, { signal: AbortSignal.timeout(4000) });
      return json({ configured: true, reachable: res.ok });
    } catch {
      return json({ configured: true, reachable: false });
    }
  }

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

  // ---- Gateway -> app delivered / read ticks for this shop's bill messages (shared secret) ----
  if (action === "gateway-receipts") {
    const cfg = getGatewayConfig();
    if (!cfg || req.headers.get("x-api-key") !== cfg.key) return json({ error: "Unauthorized" }, 401);
    const receipts = Array.isArray(body.receipts) ? body.receipts.slice(0, 200) : [];
    let updated = 0;
    for (const r of receipts as Record<string, unknown>[]) {
      const wamid = String(r?.messageId ?? "").trim();
      const status = r?.status === "read" ? "read" : r?.status === "delivered" ? "delivered" : "";
      if (!wamid || !status) continue;
      const at = typeof r.at === "string" && !Number.isNaN(Date.parse(r.at)) ? r.at : new Date().toISOString();
      // Never step back: a late "delivered" must not turn a read message into delivered.
      const from = status === "read" ? ["pending", "sent", "delivered"] : ["pending", "sent"];
      const patch: Record<string, unknown> = status === "read"
        ? { status, read_at: at }
        : { status, delivered_at: at };
      for (const table of ["whatsapp_logs", "whatsapp_messages"]) {
        const { data, error } = await supabaseAdmin
          .from(table)
          .update(patch)
          .eq("organization_id", organizationId)
          .eq("wamid", wamid)
          .in("status", from)
          .select("id, delivered_at");
        if (error) {
          console.error(`[gateway-receipts] ${table}:`, error.message);
          continue;
        }
        if (table === "whatsapp_logs") updated += data?.length ?? 0;
        // Read with no delivered tick seen (phone was online): count it as delivered at the same time.
        const missing = (data ?? []).filter((row: { delivered_at: string | null }) => !row.delivered_at);
        if (status === "read" && missing.length) {
          await supabaseAdmin
            .from(table)
            .update({ delivered_at: at })
            .in("id", missing.map((row: { id: string }) => row.id));
        }
      }
    }
    return json({ success: true, updated });
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
      const phone = body.phone ? String(body.phone).slice(0, 20) : undefined;
      return await handleControl(supabaseAdmin, action, organizationId, phone);
    }
  }
  return json({ error: "Not authorized for this organization" }, 403);
});

async function handleControl(
  supabaseAdmin: SupabaseClient,
  action: string,
  organizationId: string,
  /** Optional: link by 8-character code typed on the phone instead of scanning the QR. */
  phone?: string,
): Promise<Response> {
  const base = `/sessions/${encodeURIComponent(organizationId)}`;
  let result;
  if (action === "start") {
    result = await gatewayRequest(`${base}/start`, { method: "POST", body: phone ? { phone } : undefined });
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
