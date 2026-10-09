import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCustomerBillUrl } from "../_shared/customerBillLink.ts";
import { campaignPhonesFromTarget, isHttpsOfferImage, parseOfferPhones } from "../_shared/offerAudience.ts";
import { shopProfileFromSettings } from "../_shared/customerApp.ts";
import { invoicePushText, pushTtlSeconds, richPushData, type CustomerPushShop } from "../_shared/customerPushPayload.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// push-send: deliver customer push notifications via FCM HTTP v1.
// verify_jwt = false in config.toml. Auth is service-role getUser(token),
// then organization_members. An anon client getUser() with no stored session
// returns "Auth session missing" on this project and the dialog showed Unauthorized.
// Invoice pushes are idempotent via the partial unique index
// push_messages_one_invoice_push_per_sale_idx (sale_id, subscription_id).
// Merge to main / Vercel does not ship this. Redeploy:
//   supabase functions deploy push-send
// ---------------------------------------------------------------------------

interface PushSendRequest {
  organizationId: string;
  saleId?: string;
  campaignId?: string;
  /** Customer page domain (VITE_CUSTOMER_PAGE_DOMAIN) so the push can open the bill page. */
  customerPageDomain?: string;
  /** Staff "Send offer": create the campaign here (service role) and send its first batch. */
  newCampaign?: {
    title?: string;
    body?: string;
    imageUrl?: string | null;
    offerCode?: string | null;
    validTill?: string | null;
    /** Discount the offer code gives at website checkout (needs migration 20270116120000). */
    websiteDiscount?: { percent?: number | null; flat?: number | null; minOrder?: number | null } | null;
    /** Last-10 phones. Omitted or empty = every confirmed subscriber. */
    phones?: string[] | null;
  };
  /**
   * Capability check only. The previously deployed function rejects this body
   * (it is not a send), so the dialog can tell that selected contacts are safe.
   */
  probeAudience?: boolean;
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
    pemToDer(sa.private_key) as unknown as BufferSource,
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

// A4 guardrail: marketing sends are capped per invocation and resumable via
// push_campaigns.last_sent_offset. Campaign pushes have sale_id IS NULL, so the
// invoice partial unique index does not dedupe them — without the cap + cursor
// a timed-out invocation followed by a retry would double-notify everyone.
const MARKETING_SEND_CAP = 100;

/** push_campaigns website discount columns from the dialog, or null when none was set. */
function websiteDiscountColumns(
  d: { percent?: number | null; flat?: number | null; minOrder?: number | null } | null | undefined,
): Record<string, number | null> | null {
  if (!d) return null;
  const percent = Number(d.percent);
  const flat = Number(d.flat);
  const min = Number(d.minOrder);
  const minOrder = Number.isFinite(min) && min > 0 ? Math.round(min) : null;
  if (Number.isFinite(percent) && percent > 0) {
    return { website_discount_percent: Math.min(90, Math.round(percent * 100) / 100), website_discount_flat: null, website_min_order: minOrder };
  }
  if (Number.isFinite(flat) && flat > 0) {
    return { website_discount_percent: null, website_discount_flat: Math.round(flat), website_min_order: minOrder };
  }
  return null;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "No authorization header" });
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!token || token === supabaseAnonKey) {
      return json(401, { error: "Sign in again, then send the offer." });
    }

    const saRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
    if (!saRaw) {
      console.error("FIREBASE_SERVICE_ACCOUNT_JSON not configured");
      return json(400, { error: "Push provider not configured" });
    }

    // Pass the token into getUser. A client with only the Authorization header and
    // no stored session returns "Auth session missing" and the dialog showed Unauthorized.
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (authError || !user) {
      console.error("push-send JWT verification failed:", authError?.message);
      return json(401, { error: "Sign in again, then send the offer." });
    }
    const reqBody: PushSendRequest = await req.json();
    const { organizationId, saleId, customerPageDomain, newCampaign } = reqBody;
    let campaignId = reqBody.campaignId;
    const probeOnly = reqBody.probeAudience === true && !saleId && !campaignId && !newCampaign;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!organizationId || !uuidRegex.test(organizationId)) {
      return json(400, { error: "Invalid organizationId format" });
    }
    if (reqBody.probeAudience === true && !probeOnly) {
      return json(400, { error: "probeAudience cannot be combined with a send" });
    }
    if (!probeOnly && [saleId, campaignId, newCampaign].filter(Boolean).length !== 1) {
      return json(400, { error: "Exactly one of saleId, campaignId or newCampaign is required" });
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

    // No send. Older deployments never reach this and return 400 instead.
    if (probeOnly) return json(200, { ok: true, supportsPhoneTarget: true });

    // Kill-switch per org.
    const { data: pageSettings } = await supabase
      .from("customer_page_settings")
      .select("enabled, push_enabled")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!pageSettings?.enabled || !pageSettings?.push_enabled) {
      return json(200, { ok: true, skipped: "push_disabled" });
    }

    if (newCampaign) {
      const cTitle = String(newCampaign.title ?? "").trim().slice(0, 80);
      const cBody = String(newCampaign.body ?? "").trim().slice(0, 300);
      if (!cTitle || !cBody) return json(400, { error: "Offer title and message are required" });
      const imageUrl = String(newCampaign.imageUrl ?? "").trim();
      const validTill = String(newCampaign.validTill ?? "").trim();
      const phoneParse = parseOfferPhones(newCampaign.phones);
      if (!phoneParse.ok) return json(400, { error: phoneParse.error });
      const campaignRow: Record<string, unknown> = {
        organization_id: organizationId,
        kind: "offer",
        title: cTitle,
        body: cBody,
        image_url: isHttpsOfferImage(imageUrl) ? imageUrl.slice(0, 500) : null,
        offer_code: String(newCampaign.offerCode ?? "").trim().slice(0, 40) || null,
        valid_till: /^\d{4}-\d{2}-\d{2}$/.test(validTill) ? validTill : null,
        status: "sending",
        target: phoneParse.phones ? { phones: phoneParse.phones } : {},
        created_by: user.id,
      };
      const discount = campaignRow.offer_code ? websiteDiscountColumns(newCampaign.websiteDiscount) : null;
      let { data: created, error: createError } = await supabase
        .from("push_campaigns")
        .insert(discount ? { ...campaignRow, ...discount } : campaignRow)
        .select("id")
        .single();
      if (createError && discount && /website_(discount|min_order)/.test(createError.message ?? "")) {
        // Website discount columns not migrated yet: still send the offer.
        ({ data: created, error: createError } = await supabase
          .from("push_campaigns")
          .insert(campaignRow)
          .select("id")
          .single());
      }
      if (createError || !created) {
        console.error("push-send: could not create campaign", createError);
        return json(400, { error: `Could not create offer: ${createError?.message ?? "unknown"}` });
      }
      campaignId = created.id;
    }

    // Shop name, logo and WhatsApp number for the notification (icon + WhatsApp button).
    const loadShop = async (): Promise<CustomerPushShop | null> => {
      try {
        const [{ data: orgRow }, { data: settings }] = await Promise.all([
          supabase.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
          supabase
            .from("settings")
            .select("business_name, address, mobile_number, bill_barcode_settings")
            .eq("organization_id", organizationId)
            .maybeSingle(),
        ]);
        return shopProfileFromSettings(orgRow?.name ?? "", settings);
      } catch (shopError) {
        console.error("push-send: shop profile failed", shopError);
        return null;
      }
    };

    let title = "";
    let body = "";
    let pushKind: "invoice" | "offer" = "invoice";
    let shop: CustomerPushShop | null = null;
    let offerImage: string | null = null;
    let offerCode: string | null = null;
    let offerValidTill: string | null = null;
    let targetSaleId: string | null = null;
    let targetCampaignId: string | null = null;
    let billUrl = "";
    let startOffset = 0;
    let processed = 0;
    let phoneTarget = campaignPhonesFromTarget(null);
    // deno-lint-ignore no-explicit-any
    let targets: any[] = [];

    if (saleId) {
      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .select("id, sale_number, net_amount, total_qty, customer_phone, organization_id")
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

      // Bill page link for the tap: minted as the logged-in user (create_customer_link checks
      // org access), only now that a subscribed phone exists. Failure just means no link.
      const domain = Deno.env.get("CUSTOMER_PAGE_DOMAIN") || customerPageDomain || "";
      if (domain) {
        try {
          // The signed-in staff member's own client: create_customer_link checks org access with
          // auth.uid(), which is empty for the service role. (This client was referenced but never
          // created, so every invoice push went out without its bill link.)
          const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const [{ data: org }, { data: linkData }] = await Promise.all([
            supabase.from("organizations").select("public_subdomain").eq("id", organizationId).maybeSingle(),
            supabaseAuth.rpc("create_customer_link", { p_sale_id: sale.id }),
          ]);
          const token = (linkData as { token?: string } | null)?.token;
          billUrl = buildCustomerBillUrl(org?.public_subdomain, domain, token) ?? "";
          if (!billUrl) {
            console.error("push-send: no bill link", {
              saleId: sale.id,
              hasSubdomain: !!org?.public_subdomain,
              hasToken: !!token,
            });
          }
        } catch (linkError) {
          console.error("push-send: bill link failed", linkError);
          billUrl = "";
        }
      } else {
        // The customer app still opens the bill from sale_id for logged-in customers.
        console.error("push-send: CUSTOMER_PAGE_DOMAIN not set; push has no bill link");
      }

      shop = await loadShop();
      ({ title, body } = invoicePushText({
        shopName: shop?.name ?? "",
        saleNumber: sale.sale_number,
        netAmount: sale.net_amount,
        totalQty: sale.total_qty,
      }));
      targetSaleId = sale.id;
    } else {
      const { data: campaign, error: campaignError } = await supabase
        .from("push_campaigns")
        .select("id, title, body, status, target, last_sent_offset, image_url, offer_code, valid_till")
        .eq("id", campaignId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (campaignError || !campaign) return json(404, { error: "Campaign not found" });
      if (campaign.status !== "sending") {
        return json(400, { error: "Campaign is not in sending state" });
      }
      // Resume from the stored cursor so a re-invoke continues instead of
      // restarting from subscriber 0.
      startOffset = Math.max(0, campaign.last_sent_offset ?? 0);
      const platform = (campaign.target as { platform?: string } | null)?.platform;
      phoneTarget = campaignPhonesFromTarget(campaign.target);
      let q = supabase
        .from("push_subscriptions")
        .select("id, fcm_token")
        .eq("organization_id", organizationId)
        .eq("status", "confirmed");
      if (platform && ["android", "ios", "web"].includes(platform)) q = q.eq("platform", platform);
      if (phoneTarget.active) {
        if (phoneTarget.phones.length === 0) {
          await supabase
            .from("push_campaigns")
            .update({ status: "done", sent_at: new Date().toISOString() })
            .eq("id", campaign.id);
          return json(200, {
            ok: true,
            completed: true,
            sent: 0,
            skipped: 0,
            failed: 0,
            campaignId: campaign.id,
            targeted: 0,
          });
        }
        q = q.in("customer_phone_last10", phoneTarget.phones);
      }
      // Stable order is load-bearing: offset paging resumes correctly only if
      // the row order is deterministic across invocations.
      const { data: subs, error: subsError } = await q
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(startOffset, startOffset + MARKETING_SEND_CAP - 1);
      if (subsError) {
        console.error("push-send: audience query failed", subsError);
        return json(400, { error: "Could not load notification contacts", campaignId: campaign.id });
      }
      targets = subs ?? [];
      if (targets.length === 0) {
        // Audience exhausted (or exact multiple of the cap on the last page):
        // close the campaign so further invokes don't restart it.
        await supabase
          .from("push_campaigns")
          .update({ status: "done", sent_at: new Date().toISOString() })
          .eq("id", campaign.id);
        return json(200, {
          ok: true,
          completed: true,
          sent: 0,
          skipped: 0,
          failed: 0,
          campaignId: campaign.id,
          ...(phoneTarget.active ? { targeted: phoneTarget.phones.length } : {}),
        });
      }
      title = campaign.title;
      body = campaign.body;
      targetCampaignId = campaign.id;
      pushKind = "offer";
      shop = await loadShop();
      offerImage = campaign.image_url ?? null;
      offerCode = campaign.offer_code ?? null;
      offerValidTill = campaign.valid_till ?? null;
    }

    const richData = richPushData({ kind: pushKind, shop, imageUrl: offerImage, offerCode });
    const ttl = String(pushTtlSeconds(pushKind, offerValidTill));

    const sa = JSON.parse(saRaw) as ServiceAccount;
    const accessToken = await getAccessToken(sa);
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const sub of targets) {
      // Idempotency: one invoice push per sale+device (partial unique index).
      // Marketing pushes have sale_id IS NULL, so this insert does NOT dedupe
      // them — the resume cursor advanced at the bottom of this loop is what
      // makes campaign retries non-duplicating.
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
      } else {
        try {
          const fcmRes = await fetch(fcmUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({
              message: {
                token: sub.fcm_token,
                // Data-only: the customer service worker (src/customer/sw.ts) shows the one
                // notification. A `notification` block made the Firebase SDK show a second
                // copy without our data, so tapping it skipped the bill page and telemetry.
                data: {
                  ...richData,
                  title: String(title ?? ""),
                  body: String(body ?? ""),
                  message_id: msg.id,
                  ...(billUrl ? { url: billUrl } : {}),
                  ...(targetSaleId ? { sale_id: targetSaleId } : {}),
                  ...(targetCampaignId ? { campaign_id: targetCampaignId } : {}),
                },
                webpush: { headers: { Urgency: "high", TTL: ttl } },
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

      if (targetCampaignId) {
        // Advance the resume cursor after EVERY processed target (sent,
        // skipped, or failed — a permanently failing token must not wedge the
        // cursor). Persisted per iteration so a timed-out invocation resumes
        // instead of restarting. Residual risk, accepted: the single in-flight
        // target at the timeout boundary may send twice.
        processed++;
        await supabase
          .from("push_campaigns")
          .update({ last_sent_offset: startOffset + processed })
          .eq("id", targetCampaignId);
      }
    }

    if (targetCampaignId) {
      // Fewer rows than the cap means the audience is exhausted: close the
      // campaign. Otherwise it stays 'sending' with the advanced cursor and
      // the caller re-invokes to continue.
      const completed = targets.length < MARKETING_SEND_CAP;
      await supabase
        .from("push_campaigns")
        .update({
          last_sent_offset: startOffset + processed,
          ...(completed ? { status: "done", sent_at: new Date().toISOString() } : {}),
        })
        .eq("id", targetCampaignId);
      return json(200, {
        ok: true,
        campaignId: targetCampaignId,
        sent,
        skipped,
        failed,
        completed,
        resumeOffset: startOffset + processed,
        cap: MARKETING_SEND_CAP,
        ...(phoneTarget.active ? { targeted: phoneTarget.phones.length } : {}),
      });
    }

    return json(200, { ok: true, sent, skipped, failed });
  } catch (error) {
    console.error("Error in push-send function:", error);
    return json(500, { error: "An internal error occurred" });
  }
};

serve(handler);
