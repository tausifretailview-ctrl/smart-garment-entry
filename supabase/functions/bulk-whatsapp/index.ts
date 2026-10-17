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

const MAX_RECIPIENTS = 5000;
const MIN_GAP_MS = 8000;
const MAX_GAP_MS = 20000;
const CAMPAIGN_STATUSES = new Set(["running", "paused", "stopped", "completed", "failed"]);
const RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3 };

/** Digits only; 10-digit Indian numbers get 91, a leading trunk 0 is dropped. */
function normalizePhone(raw: string): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

/**
 * Bulk WhatsApp page backend. Browser actions (user JWT) link the user's own number on wa-gateway
 * (session "u_<userId>") and create / pause / resume / stop campaigns. wa-gateway posts per-number
 * results and delivery / read ticks back here with x-api-key = WA_GATEWAY_KEY.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const action = String(body.action ?? "");

  if (action.startsWith("gateway-")) {
    const cfg = getGatewayConfig();
    if (!cfg || req.headers.get("x-api-key") !== cfg.key) return json({ error: "Unauthorized" }, 401);
    return await handleGateway(admin, action, body);
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Unauthorized" }, 401);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) return json({ error: "Unauthorized" }, 401);

  const organizationId = String(body.organizationId ?? "").trim();
  if (!organizationId) return json({ error: "organizationId is required" }, 400);
  const access = await bulkAccess(admin, userId, organizationId);
  if (!access.allowed) return json({ error: "You do not have the Bulk WhatsApp right in this organization" }, 403);

  const sessionId = `u_${userId}`;
  const sessionPath = `/sessions/${sessionId}`;

  if (action === "session-start" || action === "session-status" || action === "session-logout") {
    const result =
      action === "session-start"
        ? await gatewayRequest(`${sessionPath}/start`, { method: "POST" })
        : action === "session-status"
          ? await gatewayRequest(`${sessionPath}/status`)
          : await gatewayRequest(sessionPath, { method: "DELETE" });
    if (!result.ok) return json({ error: result.data.error ?? "WhatsApp server error" }, result.status || 502);
    return json({ success: true, ...result.data });
  }

  if (action === "create") return await createCampaign(admin, body, userId, organizationId, sessionId);

  if (action === "pause" || action === "resume" || action === "stop") {
    const campaignId = String(body.campaignId ?? "");
    const { data: c } = await admin
      .from("bulk_whatsapp_campaigns")
      .select("id, user_id, organization_id, status")
      .eq("id", campaignId)
      .maybeSingle();
    if (!c || c.organization_id !== organizationId || (c.user_id !== userId && !access.isAdmin)) {
      return json({ error: "Campaign not found" }, 404);
    }
    if (["completed", "stopped", "failed"].includes(c.status)) return json({ success: true, status: c.status });
    const result = await gatewayRequest(`/campaigns/${campaignId}/${action}`, { method: "POST" });
    // The server forgets a campaign once it finishes. If its results never arrived, close it here.
    if (!result.ok && /not found/i.test(String(result.data.error ?? ""))) {
      const note = "Finished on the WhatsApp server, but its results did not reach the app";
      await setCampaignStatus(admin, campaignId, "failed", note);
      return json({ success: true, status: "failed", note });
    }
    if (!result.ok && action !== "stop") {
      return json({ error: result.data.error ?? "WhatsApp server error" }, result.status || 502);
    }
    const status = action === "pause" ? "paused" : action === "resume" ? "running" : "stopped";
    await setCampaignStatus(admin, campaignId, status, null);
    return json({ success: true, status });
  }

  return json({ error: "Unknown action" }, 400);
});

async function bulkAccess(admin: SupabaseClient, userId: string, organizationId: string) {
  const { data: isAdmin } = await admin.rpc("has_org_role", {
    user_id: userId,
    org_id: organizationId,
    required_role: "admin",
  });
  if (isAdmin === true) return { allowed: true, isAdmin: true };
  const { data: member } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return { allowed: false, isAdmin: false };
  // Same rule as the menu: no saved User Rights = full access; otherwise the Bulk WhatsApp tick.
  const { data: perms } = await admin
    .from("user_permissions")
    .select("permissions")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  const p = perms?.permissions as { menu?: Record<string, boolean> } | null | undefined;
  return { allowed: !p || p.menu?.bulk_whatsapp === true, isAdmin: false };
}

async function createCampaign(
  admin: SupabaseClient,
  body: Record<string, unknown>,
  userId: string,
  organizationId: string,
  sessionId: string,
): Promise<Response> {
  const message = String(body.message ?? "").slice(0, 4000);
  const name = String(body.name ?? "").trim().slice(0, 120) || `Bulk ${new Date().toISOString().slice(0, 16)}`;
  const mediaUrl = body.mediaUrl ? String(body.mediaUrl) : null;
  const mediaType = body.mediaType ? String(body.mediaType) : null;
  const mediaName = body.mediaName ? String(body.mediaName).slice(0, 120) : null;
  if (mediaUrl && !mediaUrl.startsWith("https://")) return json({ error: "Poster link must be https" }, 400);
  if (!message.trim() && !mediaUrl) return json({ error: "Type a message or attach a poster" }, 400);

  const raw = Array.isArray(body.recipients) ? (body.recipients as Record<string, unknown>[]) : [];
  const seen = new Set<string>();
  const recipients: { phone: string; name: string | null }[] = [];
  for (const r of raw) {
    const phone = normalizePhone(String(r?.phone ?? ""));
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    const n = r?.name ? String(r.name).trim().slice(0, 80) : null;
    recipients.push({ phone, name: n || null });
  }
  if (!recipients.length) return json({ error: "Add at least one valid number" }, 400);
  if (recipients.length > MAX_RECIPIENTS) return json({ error: `At most ${MAX_RECIPIENTS} numbers per send` }, 400);

  const status = await gatewayRequest(`/sessions/${sessionId}/status`);
  if (!status.ok || status.data.status !== "connected") {
    return json({ error: "Link your WhatsApp first (scan the QR on this page)" }, 400);
  }

  const { data: campaign, error: cErr } = await admin
    .from("bulk_whatsapp_campaigns")
    .insert({
      organization_id: organizationId,
      user_id: userId,
      name,
      message,
      media_url: mediaUrl,
      media_type: mediaType,
      media_name: mediaName,
      sender_number: status.data.connectedNumber ? String(status.data.connectedNumber) : null,
      status: "running",
      total_count: recipients.length,
    })
    .select("id")
    .single();
  if (cErr || !campaign) return json({ error: cErr?.message ?? "Could not save the campaign" }, 500);

  const rows = recipients.map((r, i) => ({
    campaign_id: campaign.id,
    organization_id: organizationId,
    position: i + 1,
    phone: r.phone,
    name: r.name,
  }));
  const ids: { id: string; position: number }[] = [];
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await admin.from("bulk_whatsapp_recipients").insert(rows.slice(i, i + 500)).select("id, position");
    if (error) {
      await setCampaignStatus(admin, campaign.id, "failed", error.message);
      return json({ error: error.message }, 500);
    }
    ids.push(...(data ?? []));
  }
  const idByPos = new Map(ids.map((r) => [r.position, r.id]));

  const kind = mediaType?.startsWith("video/") ? "video" : mediaType?.startsWith("image/") ? "image" : "document";
  const job = await gatewayRequest("/campaigns", {
    method: "POST",
    body: {
      campaignId: campaign.id,
      sessionId,
      // The server posts results straight back here, whatever its own settings say.
      reportUrl: `${(Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "")}/functions/v1/bulk-whatsapp`,
      message,
      minGapMs: MIN_GAP_MS,
      maxGapMs: MAX_GAP_MS,
      media: mediaUrl ? { url: mediaUrl, mimetype: mediaType ?? "image/jpeg", filename: mediaName ?? "poster", kind } : null,
      items: recipients.map((r, i) => ({
        recipientId: idByPos.get(i + 1),
        phone: r.phone,
        name: r.name ?? "",
      })),
    },
  });
  if (!job.ok) {
    const err = String(job.data.error ?? "WhatsApp server error");
    await setCampaignStatus(admin, campaign.id, "failed", err);
    return json({ error: err }, job.status || 502);
  }
  return json({ success: true, campaignId: campaign.id, total: recipients.length });
}

async function setCampaignStatus(admin: SupabaseClient, campaignId: string, status: string, note: string | null) {
  const update: Record<string, unknown> = { status, status_note: note, updated_at: new Date().toISOString() };
  if (status === "completed" || status === "stopped" || status === "failed") {
    update.completed_at = new Date().toISOString();
  }
  await admin.from("bulk_whatsapp_campaigns").update(update).eq("id", campaignId);
  if (status === "stopped" || status === "failed") {
    await admin
      .from("bulk_whatsapp_recipients")
      .update({ status: "skipped", error: status === "stopped" ? "Stopped" : note })
      .eq("campaign_id", campaignId)
      .eq("status", "pending");
  }
  await admin.rpc("refresh_bulk_whatsapp_counts", { p_campaign_id: campaignId });
}

async function handleGateway(admin: SupabaseClient, action: string, body: Record<string, unknown>): Promise<Response> {
  if (action === "gateway-result") {
    const campaignId = String(body.campaignId ?? "");
    const recipientId = String(body.recipientId ?? "");
    const sent = body.status === "sent";
    const { error } = await admin
      .from("bulk_whatsapp_recipients")
      .update({
        status: sent ? "sent" : "failed",
        wa_message_id: body.messageId ? String(body.messageId) : null,
        error: sent ? null : String(body.error ?? "Send failed").slice(0, 300),
        sent_at: sent ? String(body.at ?? new Date().toISOString()) : null,
      })
      .eq("id", recipientId)
      .eq("campaign_id", campaignId)
      .eq("status", "pending");
    if (error) return json({ error: error.message }, 500);
    await admin.rpc("refresh_bulk_whatsapp_counts", { p_campaign_id: campaignId });
    return json({ success: true });
  }

  if (action === "gateway-receipts") {
    const receipts = Array.isArray(body.receipts) ? (body.receipts as Record<string, unknown>[]) : [];
    // Keep the highest tick per message (a read can arrive in the same batch as its delivery).
    const best = new Map<string, { status: string; at: string }>();
    for (const r of receipts) {
      const id = String(r.messageId ?? "");
      const st = r.status === "read" ? "read" : "delivered";
      if (!id) continue;
      const prev = best.get(id);
      if (!prev || RANK[st] > RANK[prev.status]) best.set(id, { status: st, at: String(r.at ?? new Date().toISOString()) });
    }
    if (!best.size) return json({ success: true });
    const { data: rows } = await admin
      .from("bulk_whatsapp_recipients")
      .select("id, campaign_id, status, wa_message_id, delivered_at")
      .in("wa_message_id", [...best.keys()]);
    const touched = new Set<string>();
    for (const row of rows ?? []) {
      const next = best.get(row.wa_message_id);
      if (!next || (RANK[row.status] ?? -1) >= RANK[next.status]) continue;
      const update: Record<string, unknown> = { status: next.status };
      if (next.status === "read") {
        update.read_at = next.at;
        if (!row.delivered_at) update.delivered_at = next.at;
      } else {
        update.delivered_at = next.at;
      }
      await admin.from("bulk_whatsapp_recipients").update(update).eq("id", row.id);
      touched.add(row.campaign_id);
    }
    for (const id of touched) await admin.rpc("refresh_bulk_whatsapp_counts", { p_campaign_id: id });
    return json({ success: true, updated: touched.size });
  }

  if (action === "gateway-campaign") {
    const campaignId = String(body.campaignId ?? "");
    const status = String(body.status ?? "");
    if (!CAMPAIGN_STATUSES.has(status)) return json({ error: "Invalid status" }, 400);
    await setCampaignStatus(admin, campaignId, status, body.note ? String(body.note).slice(0, 300) : null);
    return json({ success: true });
  }

  return json({ error: "Unknown action" }, 400);
}
