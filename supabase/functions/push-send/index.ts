import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// push-send: deliver customer push notifications via FCM HTTP v1.
// verify_jwt = false in config.toml, so this function hardens itself exactly
// like send-sms: Authorization header -> getUser() -> organization_members.
// Invoice pushes are idempotent via the partial unique index
// push_messages_one_invoice_push_per_sale_idx (sale_id, subscription_id).
// ---------------------------------------------------------------------------

interface PushSendRequest {
  organizationId: string;
  saleId?: string;
  campaignId?: string;
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64UrlEncode(data: Uint8Array): string {
  let s = "";
  for (let i = 0; i < data.length; i++) s += String.fromCharCode(data[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  const assertion = `${header}.${claims}.${base64UrlEncode(new Uint8Array(sig))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`OAuth token mint failed: ${res.status}`);
  const data = await res.json();
  cachedToken = { token: data.access_token, exp: now + (data.expires_in ?? 3600) };
  return cachedToken.token;
}

function last10(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "No authorization header" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const saRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
    if (!saRaw) {
      console.error("FIREBASE_SERVICE_ACCOUNT_JSON not configured");
      return json(400, { error: "Push provider not configured" });
    }

    const { createClient: createAnonClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseAuth = createAnonClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) return json(401, { error: "Unauthorized" });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { organizationId, saleId, campaignId }: PushSendRequest = await req.json();

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!organizationId || !uuidRegex.test(organizationId)) {
      return json(400, { error: "Invalid organizationId format" });
    }
    if ((saleId && campaignId) || (!saleId && !campaignId)) {
      return json(400, { error: "Exactly one of saleId or campaignId is required" });
    }
    if ((saleId && !uuidRegex.test(saleId)) || (campaignId && !uuidRegex.test(campaignId))) {
      return json(400, { error: "Invalid saleId/campaignId format" });
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) return json(403, { error: "Forbidden" });

    // Kill-switch per org.
    const { data: pageSettings } = await supabase
      .from("customer_page_settings")
      .select("enabled, push_enabled")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!pageSettings?.enabled || !pageSettings?.push_enabled) {
      return json(200, { ok: true, skipped: "push_disabled" });
    }

    let title = "";
    let body = "";
    let targetSaleId: string | null = null;
    let targetCampaignId: string | null = null;
    // deno-lint-ignore no-explicit-any
    let targets: any[] = [];

    if (saleId) {
      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .select("id, sale_number, net_amount, customer_phone, organization_id")
        .eq("id", saleId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (saleError || !sale) return json(404, { error: "Sale not found" });

      const phone = last10(sale.customer_phone);
      if (phone.length !== 10) return json(200, { ok: true, skipped: "no_phone" });

      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("id, fcm_token")
        .eq("organization_id", organizationId)
        .eq("customer_phone_last10", phone)
        .eq("status", "confirmed")
        .eq("receives_invoices", true);
      targets = subs ?? [];
      if (targets.length === 0) return json(200, { ok: true, skipped: "no_subscriptions" });

      const amount = Number(sale.net_amount ?? 0).toLocaleString("en-IN");
      title = `Invoice ${sale.sale_number}`;
      body = `₹${amount} — tap to view your bill and offers.`;
      targetSaleId = sale.id;
    } else {
      const { data: campaign, error: campaignError } = await supabase
        .from("push_campaigns")
        .select("id, title, body, status, target")
        .eq("id", campaignId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (campaignError || !campaign) return json(404, { error: "Campaign not found" });
      if (campaign.status !== "sending") {
        return json(400, { error: "Campaign is not in sending state" });
      }
      const platform = (campaign.target as { platform?: string } | null)?.platform;
      let q = supabase
        .from("push_subscriptions")
        .select("id, fcm_token")
        .eq("organization_id", organizationId)
        .eq("status", "confirmed");
      if (platform && ["android", "ios", "web"].includes(platform)) q = q.eq("platform", platform);
      const { data: subs } = await q;
      targets = subs ?? [];
      if (targets.length === 0) return json(200, { ok: true, skipped: "no_subscriptions" });
      title = campaign.title;
      body = campaign.body;
      targetCampaignId = campaign.id;
    }

    const sa = JSON.parse(saRaw) as ServiceAccount;
    const accessToken = await getAccessToken(sa);
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const sub of targets) {
      // Idempotency: one invoice push per sale+device (partial unique index).
      const { data: msg, error: msgError } = await supabase
        .from("push_messages")
        .insert({
          organization_id: organizationId,
          campaign_id: targetCampaignId,
          sale_id: targetSaleId,
          subscription_id: sub.id,
          status: "queued",
        })
        .select("id")
        .single();
      if (msgError || !msg) {
        // 23505 = already sent for this sale+device (or a race) — skip quietly.
        skipped++;
        continue;
      }

      try {
        const fcmRes = await fetch(fcmUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            message: {
              token: sub.fcm_token,
              notification: { title, body },
              data: {
                message_id: msg.id,
                ...(targetSaleId ? { sale_id: targetSaleId } : {}),
                ...(targetCampaignId ? { campaign_id: targetCampaignId } : {}),
              },
            },
          }),
        });
        const fcmData = await fcmRes.json().catch(() => ({}));
        if (!fcmRes.ok) throw new Error(`FCM ${fcmRes.status}: ${JSON.stringify(fcmData).slice(0, 200)}`);

        await supabase
          .from("push_messages")
          .update({ status: "sent", sent_at: new Date().toISOString(), fcm_message_id: fcmData.name ?? null })
          .eq("id", msg.id);
        sent++;
      } catch (sendError) {
        const errCode = sendError instanceof Error ? sendError.message.slice(0, 200) : "send_failed";
        await supabase
          .from("push_messages")
          .update({ status: "failed", error_code: errCode })
          .eq("id", msg.id);
        // Unregistered / invalid tokens go inactive so we stop paying to retry them.
        if (/NOT_FOUND|UNREGISTERED|INVALID_ARGUMENT/i.test(errCode)) {
          await supabase
            .from("push_subscriptions")
            .update({ status: "inactive", inactive_reason: errCode.slice(0, 120) })
            .eq("id", sub.id);
        }
        failed++;
      }
    }

    return json(200, { ok: true, sent, skipped, failed });
  } catch (error) {
    console.error("Error in push-send function:", error);
    return json(500, { error: "An internal error occurred" });
  }
};

serve(handler);
