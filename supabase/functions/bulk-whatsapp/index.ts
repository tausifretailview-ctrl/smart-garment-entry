import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { gatewayBaseUrl, gatewayRequest, getGatewayConfig } from "../_shared/builtinGatewaySend.ts";
import { optOutKeyword } from "../_shared/bulkOptOutKeyword.ts";

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

/**
 * Bulk sends can run on their own wa-gateway (a second Railway service) so promotions never share a
 * server with shop bill sends. Without WA_BULK_GATEWAY_URL / WA_BULK_GATEWAY_KEY they use the bill one.
 */
function bulkGatewayConfig(): { url: string; key: string } | null {
  const url = gatewayBaseUrl(Deno.env.get("WA_BULK_GATEWAY_URL"));
  const key = (Deno.env.get("WA_BULK_GATEWAY_KEY") ?? "").trim();
  return url && key ? { url, key } : getGatewayConfig();
}

const bulkGateway = (path: string, init: { method?: string; body?: unknown } = {}) =>
  gatewayRequest(path, init, bulkGatewayConfig());

/** Failures that sending again will not fix (same rule as the page's resend button). */
/** Read by the page (bulkWhatsAppApi scheduledStart) to show "Scheduled". */
const SCHEDULE_NOTE_PREFIX = "Starts at ";

const PERMANENT_FAILURE_RE = /not on whatsapp|invalid phone|bad-request|item-not-found|unsubscribed/i;

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
 * results and delivery / read ticks back here with x-api-key = that server's key (WA_BULK_GATEWAY_KEY or WA_GATEWAY_KEY).
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
    // Either server may report: the bulk one, or the bill one for campaigns started before a switch.
    const keys = [bulkGatewayConfig()?.key, getGatewayConfig()?.key].filter(Boolean);
    const sent = req.headers.get("x-api-key") ?? "";
    if (!sent || !keys.includes(sent)) return json({ error: "Unauthorized" }, 401);
    return await handleGateway(admin, action, body);
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Unauthorized" }, 401);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) return json({ error: "Unauthorized" }, 401);

  const organizationId = String(body.organizationId ?? "").trim();
  if (!organizationId) return json({ error: "organizationId is required" }, 400);
  if (action === "platform-link-status") return await platformLinkStatus(admin, userId, organizationId);
  const access = await bulkAccess(admin, userId, organizationId);
  if (!access.allowed) return json({ error: "You do not have the Bulk WhatsApp right in this organization" }, 403);
  if (action === "session-start" || action === "create" || action === "resume" || action === "resend-failed" || action === "inbox-send") {
    const { data: org } = await admin.from("organizations").select("is_suspended").eq("id", organizationId).maybeSingle();
    if (org?.is_suspended) return json({ error: "This account is suspended. Please contact Ezzy ERP." }, 403);
  }

  const sessionId = `u_${userId}`;
  const sessionPath = `/sessions/${sessionId}`;

  if (action === "session-start" || action === "session-status" || action === "session-logout") {
    const result =
      action === "session-start"
        ? await bulkGateway(`${sessionPath}/start`, {
            method: "POST",
            // Optional: link by 8-character code typed on the phone instead of scanning the QR.
            body: body.phone ? { phone: String(body.phone).slice(0, 20) } : undefined,
          })
        : action === "session-status"
          ? await bulkGateway(`${sessionPath}/status`)
          : await bulkGateway(sessionPath, { method: "DELETE" });
    if (!result.ok) return json({ error: result.data.error ?? "WhatsApp server error" }, result.status || 502);
    return json({ success: true, ...result.data });
  }

  if (action === "create") return await createCampaign(admin, body, userId, organizationId, sessionId);

  // Up to 50 numbers per call: which have WhatsApp (the page checks a list in batches before sending).
  if (action === "check-numbers") {
    const phones = (Array.isArray(body.phones) ? body.phones : [])
      .slice(0, 50)
      .map((p) => normalizePhone(String(p)))
      .filter((p): p is string => Boolean(p));
    if (!phones.length) return json({ success: true, onWhatsApp: [] });
    const result = await bulkGateway(`${sessionPath}/check-numbers`, { method: "POST", body: { phones } });
    if (!result.ok) return json({ error: result.data.error ?? "WhatsApp server error" }, result.status || 502);
    return json({ success: true, checked: phones, onWhatsApp: result.data.onWhatsApp ?? [] });
  }

  // Up to 10 numbers per call: saved as contacts on the user's linked WhatsApp (the page loops in batches).
  if (action === "save-contacts") {
    const contacts = (Array.isArray(body.contacts) ? body.contacts : []).slice(0, 10).flatMap((c) => {
      const row = (c ?? {}) as { phone?: unknown; name?: unknown };
      const phone = normalizePhone(String(row.phone ?? ""));
      const name = String(row.name ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
      return phone && name ? [{ phone, name }] : [];
    });
    if (!contacts.length) return json({ success: true, saved: [], failed: [] });
    const result = await bulkGateway(`${sessionPath}/save-contacts`, { method: "POST", body: { contacts } });
    if (result.status === 404) {
      return json({ error: "The bulk WhatsApp server needs the latest update (Railway redeploy) to save contacts" }, 502);
    }
    if (!result.ok) return json({ error: result.data.error ?? "WhatsApp server error" }, result.status || 502);
    return json({ success: true, saved: result.data.saved ?? [], failed: result.data.failed ?? [] });
  }

  // New campaign with the same message and poster to the numbers that failed for a passing reason.
  if (action === "resend-failed") {
    const campaignId = String(body.campaignId ?? "");
    const { data: c } = await admin
      .from("bulk_whatsapp_campaigns")
      .select("id, user_id, organization_id, name, message, media_url, media_type, media_name")
      .eq("id", campaignId)
      .maybeSingle();
    if (!c || c.organization_id !== organizationId || (c.user_id !== userId && !access.isAdmin)) {
      return json({ error: "Campaign not found" }, 404);
    }
    const { data: failed, error } = await admin
      .from("bulk_whatsapp_recipients")
      .select("phone, name, error")
      .eq("campaign_id", campaignId)
      .eq("status", "failed")
      .order("position", { ascending: true })
      .limit(5000);
    if (error) return json({ error: error.message }, 500);
    const retry = (failed ?? []).filter((r) => !PERMANENT_FAILURE_RE.test(String(r.error ?? "")));
    if (!retry.length) return json({ error: "No failed numbers to try again (numbers not on WhatsApp are left out)" }, 400);
    return await createCampaign(
      admin,
      {
        name: `${String(c.name).slice(0, 100)} (resend)`,
        message: c.message,
        mediaUrl: c.media_url,
        mediaType: c.media_type,
        mediaName: c.media_name,
        recipients: retry.map((r) => ({ phone: r.phone, name: r.name })),
      },
      userId,
      organizationId,
      sessionId,
    );
  }

  if (action === "pause" || action === "resume" || action === "stop") {
    const campaignId = String(body.campaignId ?? "");
    const { data: c } = await admin
      .from("bulk_whatsapp_campaigns")
      .select("id, user_id, organization_id, status, status_note")
      .eq("id", campaignId)
      .maybeSingle();
    if (!c || c.organization_id !== organizationId || (c.user_id !== userId && !access.isAdmin)) {
      return json({ error: "Campaign not found" }, 404);
    }
    if (["completed", "stopped", "failed"].includes(c.status)) return json({ success: true, status: c.status });
    const result = await bulkGateway(`/campaigns/${campaignId}/${action}`, { method: "POST" });
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
    // A scheduled campaign paused and resumed before its time keeps showing when it starts.
    const keepNote = status !== "stopped" && String(c.status_note ?? "").startsWith(SCHEDULE_NOTE_PREFIX);
    await setCampaignStatus(admin, campaignId, status, keepNote ? c.status_note : null);
    return json({ success: true, status });
  }

  // Scheduled campaign not started yet: new time, and optionally a new name or message.
  if (action === "reschedule") {
    const campaignId = String(body.campaignId ?? "");
    const { data: c } = await admin
      .from("bulk_whatsapp_campaigns")
      .select("id, user_id, organization_id, status, status_note, media_url")
      .eq("id", campaignId)
      .maybeSingle();
    if (!c || c.organization_id !== organizationId || (c.user_id !== userId && !access.isAdmin)) {
      return json({ error: "Campaign not found" }, 404);
    }
    const note = String(c.status_note ?? "");
    const current = note.startsWith(SCHEDULE_NOTE_PREFIX) ? Date.parse(note.slice(SCHEDULE_NOTE_PREFIX.length)) : NaN;
    if (!["running", "paused"].includes(c.status) || !(current > Date.now())) {
      return json({ error: "This campaign has already started, so it cannot be changed" }, 400);
    }
    const at = Date.parse(String(body.startAt ?? ""));
    if (!Number.isFinite(at)) return json({ error: "Invalid start time" }, 400);
    if (at <= Date.now() + 60_000) return json({ error: "Pick a time later than now" }, 400);
    if (at - Date.now() > 14 * 24 * 60 * 60 * 1000) return json({ error: "Schedule at most 14 days ahead" }, 400);
    const startAt = new Date(at).toISOString();
    const message = typeof body.message === "string" ? body.message.slice(0, 4000) : null;
    if (message !== null && !message.trim() && !c.media_url) return json({ error: "Type a message or keep the poster" }, 400);

    // {name} is filled per number on the WhatsApp server, so it needs each number's name again.
    let names: Record<string, string> | undefined;
    if (message !== null) {
      names = {};
      for (let from = 0; ; from += 1000) {
        const { data, error } = await admin
          .from("bulk_whatsapp_recipients")
          .select("id, name")
          .eq("campaign_id", campaignId)
          .order("position")
          .range(from, from + 999);
        if (error) return json({ error: error.message }, 500);
        for (const r of data ?? []) names[r.id as string] = (r.name as string | null) ?? "";
        if (!data || data.length < 1000) break;
      }
    }
    const result = await bulkGateway(`/campaigns/${campaignId}/reschedule`, {
      method: "POST",
      body: { startAt, message: message ?? undefined, names },
    });
    if (result.status === 404) {
      return json({ error: "The bulk WhatsApp server needs the latest update (Railway redeploy) to edit a schedule" }, 502);
    }
    if (!result.ok) return json({ error: result.data.error ?? "WhatsApp server error" }, result.status || 502);
    const update: Record<string, unknown> = { status_note: `${SCHEDULE_NOTE_PREFIX}${startAt}`, updated_at: new Date().toISOString() };
    if (message !== null) update.message = message;
    const newName = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (newName) update.name = newName;
    await admin.from("bulk_whatsapp_campaigns").update(update).eq("id", campaignId);
    return json({ success: true, startAt });
  }

  if (action === "inbox-send" || action === "inbox-read" || action === "inbox-tags" || action === "inbox-optout") {
    return await inboxAction(admin, action, body, userId, organizationId, access.isAdmin, sessionPath);
  }

  return json({ error: "Unknown action" }, 400);
});

/**
 * Platform Admin > WhatsApp Only tab: is each user of this shop linked on the bulk server?
 * Read-only status calls; it never starts or logs out a session.
 */
async function platformLinkStatus(admin: SupabaseClient, userId: string, organizationId: string) {
  const { data: isPlatformAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "platform_admin" });
  if (isPlatformAdmin !== true) return json({ error: "Only platform admins can check this" }, 403);
  const { data: members, error } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId);
  if (error) return json({ error: error.message }, 500);
  const users = await Promise.all(
    (members ?? []).map(async (m: { user_id: string }) => {
      const result = await bulkGateway(`/sessions/u_${m.user_id}/status`);
      if (!result.ok) {
        return { userId: m.user_id, status: "unknown", connectedNumber: null, error: result.data.error ?? "WhatsApp server error" };
      }
      return {
        userId: m.user_id,
        status: String(result.data.status ?? "disconnected"),
        connectedNumber: (result.data.connectedNumber as string | null | undefined) ?? null,
      };
    }),
  );
  return json({ success: true, users });
}

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
  // Videos: the WhatsApp server re-encodes to 480p (small) or 720p (medium); original sends the file as is.
  const videoQuality = body.videoQuality === "small" || body.videoQuality === "original" ? body.videoQuality : "medium";
  if (mediaUrl && !mediaUrl.startsWith("https://")) return json({ error: "Poster link must be https" }, 400);
  // Scheduled send: the WhatsApp server holds the campaign until this time.
  let startAt: string | null = null;
  if (body.startAt) {
    const at = Date.parse(String(body.startAt));
    if (!Number.isFinite(at)) return json({ error: "Invalid start time" }, 400);
    if (at - Date.now() > 14 * 24 * 60 * 60 * 1000) return json({ error: "Schedule at most 14 days ahead" }, 400);
    if (at > Date.now() + 60_000) startAt = new Date(at).toISOString();
  }
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

  // Customers who replied STOP to this shop are never sent bulk messages.
  const optedOut = new Set<string>();
  for (let i = 0; i < recipients.length; i += 500) {
    const { data } = await admin
      .from("bulk_whatsapp_optouts")
      .select("phone")
      .eq("organization_id", organizationId)
      .in("phone", recipients.slice(i, i + 500).map((r) => r.phone));
    for (const row of data ?? []) optedOut.add(row.phone);
  }
  if (optedOut.size) {
    const keep = recipients.filter((r) => !optedOut.has(r.phone));
    if (!keep.length) return json({ error: "All these numbers have unsubscribed (replied STOP)" }, 400);
    recipients.splice(0, recipients.length, ...keep);
  }

  // The same message started again while it is still sending (double tap, or Send pressed again) must not
  // reach a number twice: numbers already in a running or paused campaign with this exact message are left out.
  // Once that campaign is completed or stopped the same message can be sent again (e.g. test sends).
  // Scheduling the same message for another time (morning and evening) is allowed.
  const repeated = await activeRecipientsOfSameMessage(admin, organizationId, message, mediaName, recipients.map((r) => r.phone), startAt);
  if (repeated.size) {
    const keep = recipients.filter((r) => !repeated.has(r.phone));
    if (!keep.length) {
      return json({ error: "This same message is still sending to these numbers. Wait for it to finish, or stop it in Reports, then send again." }, 400);
    }
    recipients.splice(0, recipients.length, ...keep);
  }

  const status = await bulkGateway(`/sessions/${sessionId}/status`);
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
      status_note: startAt ? `${SCHEDULE_NOTE_PREFIX}${startAt}` : null,
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
  const job = await bulkGateway("/campaigns", {
    method: "POST",
    body: {
      campaignId: campaign.id,
      sessionId,
      // The server posts results straight back here, whatever its own settings say.
      reportUrl: `${(Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "")}/functions/v1/bulk-whatsapp`,
      message,
      minGapMs: MIN_GAP_MS,
      maxGapMs: MAX_GAP_MS,
      startAt,
      media: mediaUrl
        ? {
          url: mediaUrl,
          mimetype: mediaType ?? "image/jpeg",
          filename: mediaName ?? "poster",
          kind,
          quality: kind === "video" ? videoQuality : undefined,
        }
        : null,
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
  return json({
    success: true,
    campaignId: campaign.id,
    total: recipients.length,
    unsubscribed: optedOut.size,
    alreadySent: repeated.size,
  });
}

/**
 * Phones (of `phones`) in this shop's running or paused campaigns with the same message text and poster
 * name that go out at the same time: both now, or both scheduled within a minute of each other.
 */
async function activeRecipientsOfSameMessage(
  admin: SupabaseClient,
  organizationId: string,
  message: string,
  mediaName: string | null,
  phones: string[],
  startAt: string | null,
): Promise<Set<string>> {
  const out = new Set<string>();
  const newStart = startAt ? Date.parse(startAt) : null;
  const sameTime = (note: string | null) => {
    const at = note?.startsWith(SCHEDULE_NOTE_PREFIX) ? Date.parse(note.slice(SCHEDULE_NOTE_PREFIX.length)) : NaN;
    const otherStart = at > Date.now() ? at : null;
    if (newStart === null || otherStart === null) return newStart === otherStart;
    return Math.abs(newStart - otherStart) < 60_000;
  };
  let q = admin
    .from("bulk_whatsapp_campaigns")
    .select("id, status_note")
    .eq("organization_id", organizationId)
    .eq("message", message)
    .in("status", ["running", "paused"])
    .limit(50);
  q = mediaName ? q.eq("media_name", mediaName) : q.is("media_name", null);
  const { data: campaigns } = await q;
  const ids = (campaigns ?? []).filter((c) => sameTime(c.status_note as string | null)).map((c) => c.id as string);
  if (!ids.length) return out;
  for (let i = 0; i < phones.length; i += 500) {
    const { data } = await admin
      .from("bulk_whatsapp_recipients")
      .select("phone")
      .in("campaign_id", ids)
      .in("status", ["pending", "sent", "delivered", "read"])
      .in("phone", phones.slice(i, i + 500));
    for (const row of data ?? []) out.add(row.phone as string);
  }
  return out;
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
    const skipped = body.status === "skipped";
    const { error } = await admin
      .from("bulk_whatsapp_recipients")
      .update({
        status: sent ? "sent" : skipped ? "skipped" : "failed",
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
    // Replies sent from the Inbox get the same ticks (errors ignored before the Inbox SQL is run).
    const { data: replies } = await admin
      .from("bulk_whatsapp_messages")
      .select("id, status, wa_message_id")
      .in("wa_message_id", [...best.keys()])
      .in("status", ["sent", "delivered"]);
    for (const row of replies ?? []) {
      const next = best.get(row.wa_message_id);
      if (!next || (RANK[row.status] ?? -1) >= RANK[next.status]) continue;
      await admin.from("bulk_whatsapp_messages").update({ status: next.status }).eq("id", row.id);
    }
    return json({ success: true, updated: touched.size });
  }

  if (action === "gateway-optout") {
    // Session "u_<userId>": the unsubscribe applies to every shop this user sent bulk messages to that number from.
    const sessionId = String(body.sessionId ?? "");
    const userId = sessionId.startsWith("u_") ? sessionId.slice(2) : "";
    const phone = normalizePhone(String(body.phone ?? ""));
    if (!userId || !phone) return json({ error: "sessionId and phone are required" }, 400);
    const { data: campaigns } = await admin
      .from("bulk_whatsapp_campaigns")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);
    const campaignIds = (campaigns ?? []).map((c) => c.id);
    if (!campaignIds.length) return json({ success: true, organizations: 0 });
    const { data: hits } = await admin
      .from("bulk_whatsapp_recipients")
      .select("organization_id")
      .eq("phone", phone)
      .in("campaign_id", campaignIds)
      .limit(50);
    const orgIds = [...new Set((hits ?? []).map((h) => h.organization_id as string))];
    if (!orgIds.length) return json({ success: true, organizations: 0 });
    await setOptOut(admin, orgIds, phone, body.subscribe !== true, "reply");
    return json({ success: true, organizations: orgIds.length });
  }

  if (action === "gateway-inbox") return await gatewayInbox(admin, body);

  if (action === "gateway-campaign") {
    const campaignId = String(body.campaignId ?? "");
    const status = String(body.status ?? "");
    if (!CAMPAIGN_STATUSES.has(status)) return json({ error: "Invalid status" }, 400);
    await setCampaignStatus(admin, campaignId, status, body.note ? String(body.note).slice(0, 300) : null);
    return json({ success: true });
  }

  return json({ error: "Unknown action" }, 400);
}

const MEDIA_LABEL: Record<string, string> = {
  image: "📷 Photo",
  video: "🎥 Video",
  audio: "🎤 Voice message",
  document: "📄 Document",
  sticker: "Sticker",
  location: "📍 Location",
  contact: "👤 Contact",
};
const INBOX_TAG_MAX = 10;

/**
 * A message in a bulk number's chat (session "u_<userId>"). Kept only for customers this user sent
 * bulk messages to, one chat per shop; anything else answers tracked: false so wa-gateway stops
 * reporting that chat for a while. A chat starts with the customer's message; messages typed on the
 * linked phone are added to chats that already exist.
 */
async function gatewayInbox(admin: SupabaseClient, body: Record<string, unknown>): Promise<Response> {
  const sessionId = String(body.sessionId ?? "");
  const userId = sessionId.startsWith("u_") ? sessionId.slice(2) : "";
  const phone = normalizePhone(String(body.phone ?? ""));
  if (!userId || !phone) return json({ error: "sessionId and phone are required" }, 400);
  const fromMe = body.fromMe === true;
  const { data: hits, error: hitsError } = await admin
    .from("bulk_whatsapp_recipients")
    .select("organization_id, name, bulk_whatsapp_campaigns!inner(user_id)")
    .eq("phone", phone)
    .eq("bulk_whatsapp_campaigns.user_id", userId)
    .limit(200);
  if (hitsError) return json({ error: hitsError.message }, 500);
  if (!hits?.length) return json({ success: true, tracked: false });

  const orgs = new Map<string, string | null>();
  for (const h of hits) {
    const org = h.organization_id as string;
    if (!orgs.get(org)) orgs.set(org, (h.name as string | null)?.trim() || null);
  }
  const mediaType = typeof body.mediaType === "string" && MEDIA_LABEL[body.mediaType] ? body.mediaType : null;
  const text = String(body.text ?? "").slice(0, 4000);
  const parsed = new Date(String(body.at ?? ""));
  const at = Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now() + 60_000 ? new Date().toISOString() : parsed.toISOString();
  // A reply means the customer opened the chat, so bulk messages sent to them before it count as read
  // (customers with blue ticks off never send a read receipt).
  if (!fromMe) await markRepliedAsRead(admin, userId, phone, at);
  // STOP / START is also saved here, so the unsubscribe holds even if the server's own report is lost.
  const keyword = fromMe ? null : optOutKeyword(text);
  if (keyword) await setOptOut(admin, [...orgs.keys()], phone, keyword === "stop", "reply");
  const preview = (text || (mediaType ? MEDIA_LABEL[mediaType] : "") || "Message").slice(0, 200);
  const pushName = typeof body.name === "string" ? body.name.trim().slice(0, 80) || null : null;
  const messageId = body.messageId ? String(body.messageId).slice(0, 128) : null;

  for (const [organizationId, recipientName] of orgs) {
    const find = () =>
      admin
        .from("bulk_whatsapp_chats")
        .select("id, unread_count, name")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .eq("phone", phone)
        .maybeSingle();
    let { data: chat, error } = await find();
    if (error) return json({ error: error.message }, 500);
    if (!chat) {
      if (fromMe) continue;
      const created = await admin
        .from("bulk_whatsapp_chats")
        .insert({ organization_id: organizationId, user_id: userId, phone, name: recipientName || pushName, last_message_at: at })
        .select("id, unread_count, name")
        .single();
      // Two messages at once: the other one made the chat.
      chat = created.data ?? (await find()).data;
      if (!chat) return json({ error: created.error?.message ?? "Could not save the chat" }, 500);
    }
    const { error: insertError } = await admin.from("bulk_whatsapp_messages").insert({
      chat_id: chat.id,
      organization_id: organizationId,
      user_id: userId,
      direction: fromMe ? "out" : "in",
      body: text,
      media_type: mediaType,
      wa_message_id: messageId,
      status: fromMe ? "sent" : "received",
      created_at: at,
    });
    if (insertError) {
      if (insertError.code === "23505") continue; // the same message reported twice
      return json({ error: insertError.message }, 500);
    }
    await admin
      .from("bulk_whatsapp_chats")
      .update({
        last_message_at: at,
        last_message_preview: preview,
        last_direction: fromMe ? "out" : "in",
        unread_count: fromMe ? 0 : (chat.unread_count ?? 0) + 1,
        ...(!chat.name && (recipientName || pushName) ? { name: recipientName || pushName } : {}),
      })
      .eq("id", chat.id);
  }
  return json({ success: true, tracked: true });
}

/** Unsubscribes (or subscribes again) a number from these shops' bulk messages. */
async function setOptOut(admin: SupabaseClient, orgIds: string[], phone: string, unsubscribe: boolean, source: string) {
  if (!orgIds.length) return null;
  const { error } = unsubscribe
    ? await admin
        .from("bulk_whatsapp_optouts")
        .upsert(orgIds.map((organization_id) => ({ organization_id, phone, source })), {
          onConflict: "organization_id,phone",
          ignoreDuplicates: true,
        })
    : await admin.from("bulk_whatsapp_optouts").delete().eq("phone", phone).in("organization_id", orgIds);
  return error;
}

async function markRepliedAsRead(admin: SupabaseClient, userId: string, phone: string, at: string) {
  const { data: rows, error } = await admin
    .from("bulk_whatsapp_recipients")
    .select("id, campaign_id, delivered_at, bulk_whatsapp_campaigns!inner(user_id)")
    .eq("phone", phone)
    .eq("bulk_whatsapp_campaigns.user_id", userId)
    .in("status", ["sent", "delivered"])
    .lte("sent_at", at)
    .limit(200);
  if (error || !rows?.length) return;
  const ids = rows.map((r) => r.id as string);
  const noDelivery = rows.filter((r) => !r.delivered_at).map((r) => r.id as string);
  if (noDelivery.length) await admin.from("bulk_whatsapp_recipients").update({ delivered_at: at }).in("id", noDelivery);
  await admin
    .from("bulk_whatsapp_recipients")
    .update({ status: "read", read_at: at })
    .in("id", ids)
    .in("status", ["sent", "delivered"]);
  for (const id of new Set(rows.map((r) => r.campaign_id as string))) {
    await admin.rpc("refresh_bulk_whatsapp_counts", { p_campaign_id: id });
  }
}

/** Inbox actions from the page: reply (from the user's own linked number), mark read, set tags, block / unblock. */
async function inboxAction(
  admin: SupabaseClient,
  action: string,
  body: Record<string, unknown>,
  userId: string,
  organizationId: string,
  isAdmin: boolean,
  sessionPath: string,
): Promise<Response> {
  const { data: chat } = await admin
    .from("bulk_whatsapp_chats")
    .select("id, organization_id, user_id, phone")
    .eq("id", String(body.chatId ?? ""))
    .maybeSingle();
  if (!chat || chat.organization_id !== organizationId || (chat.user_id !== userId && !isAdmin)) {
    return json({ error: "Chat not found" }, 404);
  }

  if (action === "inbox-read") {
    await admin.from("bulk_whatsapp_chats").update({ unread_count: 0 }).eq("id", chat.id);
    return json({ success: true });
  }

  // Block: this number gets no more bulk messages from this shop, same as the customer replying STOP.
  if (action === "inbox-optout") {
    const unsubscribe = body.unsubscribe !== false;
    const error = await setOptOut(admin, [organizationId], chat.phone, unsubscribe, "manual");
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, unsubscribed: unsubscribe });
  }

  if (action === "inbox-tags") {
    const tags = [
      ...new Set(
        (Array.isArray(body.tags) ? body.tags : [])
          .map((t) => String(t).trim().replace(/\s+/g, " ").slice(0, 24))
          .filter(Boolean),
      ),
    ].slice(0, INBOX_TAG_MAX);
    const { error } = await admin.from("bulk_whatsapp_chats").update({ tags }).eq("id", chat.id);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, tags });
  }

  // inbox-send: the reply goes from the number that has this chat, so only its owner can send.
  if (chat.user_id !== userId) {
    return json({ error: "This chat is on another user's WhatsApp. Only they can reply from it." }, 403);
  }
  const text = String(body.text ?? "").trim().slice(0, 4000);
  if (!text) return json({ error: "Type a message first" }, 400);
  const result = await bulkGateway(`${sessionPath}/send-text`, {
    method: "POST",
    body: { phone: chat.phone, message: text },
  });
  const ok = result.ok && result.data.success !== false;
  const now = new Date().toISOString();
  const error = ok ? null : String(result.data.error ?? "WhatsApp server error").slice(0, 300);
  const { data: row } = await admin
    .from("bulk_whatsapp_messages")
    .insert({
      chat_id: chat.id,
      organization_id: organizationId,
      user_id: userId,
      direction: "out",
      body: text,
      wa_message_id: ok && result.data.messageId ? String(result.data.messageId) : null,
      status: ok ? "sent" : "failed",
      error,
      sent_by: userId,
      created_at: now,
    })
    .select("id")
    .single();
  if (!ok) return json({ error, messageId: row?.id ?? null }, result.status && result.status < 500 ? 400 : 502);
  await admin
    .from("bulk_whatsapp_chats")
    .update({ last_message_at: now, last_message_preview: text.slice(0, 200), last_direction: "out", unread_count: 0 })
    .eq("id", chat.id);
  return json({ success: true, id: row?.id ?? null });
}
