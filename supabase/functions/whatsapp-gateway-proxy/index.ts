import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { friendlyGatewayError, gatewayRequest, getGatewayConfig } from "../_shared/builtinGatewaySend.ts";
import { formatPhoneNumber } from "../_shared/whatsappPhone.ts";
import { planWappConnectSendSteps } from "../_shared/wappConnectSend.ts";
import { loadCreditBlockReason } from "../_shared/whatsappCredits.ts";

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
/** error_message of a failed bill handed to the gateway to resend after a relink (status pending meanwhile). */
const RESEND_MARK = "Resending after WhatsApp linked again";
/** Bills that failed with "not connected" within this window are resent after the next link. */
const RESEND_WINDOW_MS = 24 * 60 * 60 * 1000;
/**
 * A bill handed to the gateway stays with it this long before the next "connected" event may hand it
 * over again. Baileys reconnects several times a day, and every reconnect fires that event; without
 * this gate a bill still in the gateway's queue (or sent, with its result report lost) went out twice.
 */
const RESEND_RETRY_AFTER_MS = 30 * 60 * 1000;

/**
 * Browser -> gateway control plane for "Ezzy ERP WhatsApp" (start/QR, status, logout, groups), authorized
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

  // Platform Admin: shops on Ezzy ERP WhatsApp whose link is down, with the gateway's reason.
  if (action === "platform-link-alerts") {
    const userId = await callerId(supabaseAdmin, req);
    if (!userId) return json({ error: "Unauthorized" }, 401);
    const { data: isPlatformAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "platform_admin" });
    if (isPlatformAdmin !== true) return json({ error: "Platform admins only" }, 403);
    return json(await platformLinkAlerts(supabaseAdmin));
  }

  const organizationId = String(body.organizationId ?? "").trim();
  if (!organizationId) return json({ error: "organizationId is required" }, 400);

  // ---- Gateway -> app: result of one bill resent after a relink (shared secret) ----
  if (action === "gateway-resend-result") {
    const cfg = getGatewayConfig();
    if (!cfg || req.headers.get("x-api-key") !== cfg.key) return json({ error: "Unauthorized" }, 401);
    const logId = String(body.logId ?? "").trim();
    if (!logId) return json({ error: "logId is required" }, 400);
    const ok = body.success === true;
    const patch: Record<string, unknown> = ok
      ? { status: "sent", wamid: body.messageId ? String(body.messageId) : null, sent_at: new Date().toISOString(), error_message: null }
      : { status: "failed", error_message: friendlyGatewayError(String(body.error ?? "Resend failed")) };
    const { error } = await supabaseAdmin
      .from("whatsapp_logs")
      .update(patch)
      .eq("id", logId)
      .eq("organization_id", organizationId)
      .eq("error_message", RESEND_MARK);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  // ---- Gateway -> app connection event (shared secret) ----
  if (action === "gateway-event") {
    const cfg = getGatewayConfig();
    if (!cfg || req.headers.get("x-api-key") !== cfg.key) return json({ error: "Unauthorized" }, 401);
    const status = String(body.status ?? "");
    if (!VALID_STATUS.has(status)) return json({ error: "Invalid status" }, 400);
    const number = body.connectedNumber ? String(body.connectedNumber).replace(/\D/g, "") : null;
    const now = new Date().toISOString();
    const update: Record<string, unknown> = { builtin_status: status, updated_at: now, builtin_status_at: now };
    if (status === "connected" && number) update.builtin_connected_number = number;
    if (status === "logged_out") update.builtin_connected_number = null;
    let { error } = await supabaseAdmin
      .from("whatsapp_api_settings")
      .update(update)
      .eq("organization_id", organizationId);
    if (error && /builtin_status_at/.test(error.message)) {
      // Column added by SQL that may not be run yet.
      delete update.builtin_status_at;
      ({ error } = await supabaseAdmin.from("whatsapp_api_settings").update(update).eq("organization_id", organizationId));
    }
    if (error) return json({ error: error.message }, 500);
    let resent = 0;
    if (status === "connected") {
      try {
        resent = await resendAfterRelink(supabaseAdmin, organizationId);
      } catch (e) {
        console.error("[whatsapp-gateway-proxy] resend after relink failed", e);
      }
    }
    return json({ success: true, resent });
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
  const userId = await callerId(supabaseAdmin, req);
  if (!userId) return json({ error: "Unauthorized" }, 401);

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
  } else if (action === "groups") {
    // Settings > WhatsApp: groups the shop number is in, to pick one for bill customers.
    result = await gatewayRequest(`${base}/groups`);
    if (!result.ok) return json({ error: result.data.error ?? "Gateway error" }, result.status || 502);
    return json({ success: true, groups: result.data.groups ?? [] });
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

async function callerId(supabaseAdmin: SupabaseClient, req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : data?.user?.id ?? null;
}

interface FailedBill {
  id: string;
  phone_number: string;
  reference_id: string | null;
  message: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  provider_response: {
    retry?: { message?: string | null; fileUrl?: string | null; filename?: string | null; singleMessage?: boolean };
    /** When this bill was last handed to the gateway for a resend (ISO). */
    resend_handed_at?: string | null;
  } | null;
}

/** A pending bill handed to the gateway recently is still its job: leave it alone. */
function resendHandedRecently(row: Pick<FailedBill, "status" | "provider_response">, now = Date.now()): boolean {
  if (row.status !== "pending") return false;
  const at = Date.parse(String(row.provider_response?.resend_handed_at ?? ""));
  return Number.isFinite(at) && now - at < RESEND_RETRY_AFTER_MS;
}

/**
 * The shop's number is linked again: hand the bills that failed with "not connected" in the last 24 hours
 * to the gateway, which sends them one by one with a gap and reports each result (gateway-resend-result).
 * A bill already sent again by hand, or an older failed try of the same bill, is not sent twice.
 */
async function resendAfterRelink(supabaseAdmin: SupabaseClient, organizationId: string): Promise<number> {
  const since = new Date(Date.now() - RESEND_WINDOW_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("whatsapp_logs")
    .select("id, phone_number, reference_id, message, status, error_message, created_at, provider_response")
    .eq("organization_id", organizationId)
    .eq("provider", "builtin")
    .in("status", ["failed", "pending"])
    .gte("created_at", since)
    .not("provider_response->retry", "is", null)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw error;
  const candidates = ((data ?? []) as FailedBill[]).filter((row) =>
    row.status === "failed"
      ? /not connected/i.test(row.error_message ?? "")
      : row.error_message === RESEND_MARK && !resendHandedRecently(row)
  );
  if (!candidates.length) return 0;

  if (await loadCreditBlockReason(supabaseAdmin, organizationId)) return 0;

  const billKey = (row: { phone_number: string; reference_id: string | null; message?: string | null }) =>
    `${row.phone_number}|${row.reference_id ?? row.message ?? ""}`;
  // Sent later (by hand or a newer bill send) for the same customer and bill: skip.
  const { data: sentRows } = await supabaseAdmin
    .from("whatsapp_logs")
    .select("phone_number, reference_id, message, created_at")
    .eq("organization_id", organizationId)
    .in("status", ["sent", "delivered", "read"])
    .gte("created_at", since)
    .in("phone_number", [...new Set(candidates.map((r) => r.phone_number))]);
  const lastSent = new Map<string, string>();
  for (const row of (sentRows ?? []) as { phone_number: string; reference_id: string | null; message: string | null; created_at: string }[]) {
    const key = billKey(row);
    if (!lastSent.has(key) || lastSent.get(key)! < row.created_at) lastSent.set(key, row.created_at);
  }
  const newest = new Map<string, FailedBill>();
  const skipped: string[] = [];
  for (const row of candidates) {
    const key = billKey(row);
    const sentAt = lastSent.get(key);
    if (sentAt && sentAt > row.created_at) {
      skipped.push(row.id);
      continue;
    }
    const prev = newest.get(key);
    if (prev) skipped.push(prev.id);
    newest.set(key, row);
  }
  if (skipped.length) {
    await supabaseAdmin
      .from("whatsapp_logs")
      .update({ status: "failed", error_message: "Not resent after relink: this bill was sent again later" })
      .in("id", skipped);
  }

  const jobs = [...newest.values()].flatMap((row) => {
    const retry = row.provider_response?.retry ?? {};
    const phone = formatPhoneNumber(row.phone_number);
    const fileUrl = String(retry.fileUrl ?? "").trim();
    const steps = planWappConnectSendSteps({
      hasFile: Boolean(fileUrl),
      message: String(retry.message ?? ""),
      singleMessage: retry.singleMessage !== false,
    }).map((step) => ({ kind: step.role === "file" ? "file" : "text", message: step.message }));
    if (!phone || !steps.length) return [];
    return [{ logId: row.id, phone, fileUrl: fileUrl || undefined, filename: retry.filename || "Invoice.pdf", steps }];
  });
  if (!jobs.length) return 0;

  const ids = jobs.map((j) => j.logId);
  const handedAt = new Date().toISOString();
  const byId = new Map([...newest.values()].map((r) => [r.id, r]));
  await Promise.all(
    ids.map((id) =>
      supabaseAdmin
        .from("whatsapp_logs")
        .update({
          status: "pending",
          error_message: RESEND_MARK,
          provider_response: { ...(byId.get(id)?.provider_response ?? {}), resend_handed_at: handedAt },
        })
        .eq("id", id)
    ),
  );
  const result = await gatewayRequest(`/sessions/${encodeURIComponent(organizationId)}/resend`, {
    method: "POST",
    body: { jobs },
  });
  if (!result.ok || result.data.success === false) {
    // Left failed, so the next link tries again.
    await supabaseAdmin
      .from("whatsapp_logs")
      .update({ status: "failed", error_message: friendlyGatewayError("WhatsApp session is not connected") })
      .in("id", ids)
      .eq("error_message", RESEND_MARK);
    return 0;
  }
  return jobs.length;
}

/** Shops on Ezzy ERP WhatsApp whose link is not up right now, with the gateway's reason and bills waiting. */
async function platformLinkAlerts(supabaseAdmin: SupabaseClient) {
  let { data: settings, error } = await supabaseAdmin
    .from("whatsapp_api_settings")
    .select("organization_id, is_active, builtin_status, builtin_status_at, builtin_connected_number, updated_at")
    .eq("send_provider", "builtin");
  if (error && /builtin_status_at/.test(error.message)) {
    ({ data: settings, error } = await supabaseAdmin
      .from("whatsapp_api_settings")
      .select("organization_id, is_active, builtin_status, builtin_connected_number, updated_at")
      .eq("send_provider", "builtin"));
  }
  if (error) return { success: false, error: error.message };
  const rows = (settings ?? []) as {
    organization_id: string;
    is_active: boolean | null;
    builtin_status: string | null;
    builtin_status_at?: string | null;
    builtin_connected_number: string | null;
    updated_at: string | null;
  }[];

  const live = new Map<string, { status: string; lastDisconnect: { code: number | null; reason: string; at: string } | null }>();
  const gw = await gatewayRequest("/sessions");
  const gatewayReachable = gw.ok;
  for (const row of (gw.data.sessions ?? []) as { id: string; status: string; lastDisconnect: { code: number | null; reason: string; at: string } | null }[]) {
    live.set(row.id, row);
  }

  const down = rows.filter((row) => {
    const status = live.get(row.organization_id)?.status ?? (gatewayReachable ? "disconnected" : row.builtin_status);
    return status !== "connected";
  });
  if (!down.length) return { success: true, gatewayReachable, alerts: [] };

  const ids = down.map((r) => r.organization_id);
  const [{ data: orgs }, { data: failed }] = await Promise.all([
    supabaseAdmin.from("organizations").select("id, name").in("id", ids),
    supabaseAdmin
      .from("whatsapp_logs")
      .select("organization_id, error_message")
      .in("organization_id", ids)
      .eq("provider", "builtin")
      .eq("status", "failed")
      .gte("created_at", new Date(Date.now() - RESEND_WINDOW_MS).toISOString())
      .ilike("error_message", "%not connected%")
      .limit(5000),
  ]);
  const names = new Map(((orgs ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name]));
  const waiting = new Map<string, number>();
  for (const row of (failed ?? []) as { organization_id: string }[]) {
    waiting.set(row.organization_id, (waiting.get(row.organization_id) ?? 0) + 1);
  }

  const alerts = down.map((row) => {
    const gwRow = live.get(row.organization_id);
    return {
      organizationId: row.organization_id,
      organizationName: names.get(row.organization_id) ?? row.organization_id,
      integrationOn: row.is_active !== false,
      status: gwRow?.status ?? (gatewayReachable ? "disconnected" : row.builtin_status ?? "unknown"),
      since: gwRow?.lastDisconnect?.at ?? row.builtin_status_at ?? row.updated_at,
      reason: gwRow?.lastDisconnect?.reason ?? (gatewayReachable && !gwRow ? "No saved link on the WhatsApp server: the shop must link again." : null),
      closeCode: gwRow?.lastDisconnect?.code ?? null,
      lastNumber: row.builtin_connected_number,
      failedWaiting: waiting.get(row.organization_id) ?? 0,
    };
  });
  alerts.sort((a, b) => b.failedWaiting - a.failedWaiting || String(b.since ?? "").localeCompare(String(a.since ?? "")));
  return { success: true, gatewayReachable, alerts };
}
