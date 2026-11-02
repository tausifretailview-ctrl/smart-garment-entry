// amazon-sync: sends Ezzy stock to the shop's Amazon.in listings (Amazon stock sync, step 1).
// Only for shops with the Platform Admin feature "amazon_sync" and the switch on in /amazon-sync.
//
//   { action: "save_keys", organizationId, clientId, clientSecret, refreshToken }  shop admin
//   { action: "test", organizationId }                                            shop admin
//   { action: "sync_now", organizationId }        push SKUs waiting (needs_push)  shop admin
//   { action: "resync_all", organizationId }      push every mapped SKU again     shop admin
//   { action: "scheduled" }                       pg_cron every 2 min (one-time ticket)
//
// Keys live in amazon_channel_secrets, which only this function (service role) can read.
// Amazon orders are NOT pulled in step 1: the shop still bills Amazon orders in Ezzy.
// verify_jwt = false (config.toml): user calls are checked here, the cron call by its ticket.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isInternalDispatch,
  isServiceRoleRequest,
  parseDispatchTicketFromBody,
  parseDispatchTicketHeader,
} from "../_shared/internalDispatch.ts";
import {
  AMAZON_IN_MARKETPLACE_ID,
  amazonPushQty,
  buildQuantityPatch,
  effectiveBuffer,
  isValidSellerId,
  listingsItemUrl,
  LWA_TOKEN_URL,
  readPushReply,
  SP_API_EU_ENDPOINT,
} from "../_shared/amazonSpApi.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FEATURE = "amazon_sync";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** SKUs per shop per run; Amazon allows about 5 listing updates a second. */
const SKUS_PER_RUN = 120;
const PAUSE_MS = 250;
/** Stop starting new pushes after this long, so the run ends inside the edge time limit. */
const RUN_BUDGET_MS = 100_000;

// deno-lint-ignore no-explicit-any
type Db = any;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function isCronCall(req: Request, body: unknown, db: Db): Promise<boolean> {
  if (isInternalDispatch(req) || isServiceRoleRequest(req)) return true;
  const ticket = parseDispatchTicketHeader(req) ?? parseDispatchTicketFromBody(body);
  if (!ticket) return false;
  const { data, error } = await db.rpc("consume_backup_dispatch_ticket", { p_id: ticket.id, p_token: ticket.token });
  return !error && data === true;
}

type Shop = {
  orgId: string;
  sellerId: string;
  marketplaceId: string;
  defaultBuffer: number;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

type LoadResult = { ok: true; shop: Shop } | { ok: false; code: string; error: string };

async function loadShop(db: Db, orgId: string): Promise<LoadResult> {
  const [{ data: org }, { data: settings, error: settingsError }, { data: secrets }] = await Promise.all([
    db.from("organizations").select("enabled_features").eq("id", orgId).maybeSingle(),
    db.from("amazon_channel_settings").select("enabled, seller_id, marketplace_id, default_buffer").eq("organization_id", orgId).maybeSingle(),
    db.from("amazon_channel_secrets").select("lwa_client_id, lwa_client_secret, refresh_token").eq("organization_id", orgId).maybeSingle(),
  ]);
  if (settingsError && /amazon_channel_settings|does not exist|schema cache/i.test(settingsError.message || "")) {
    return { ok: false, code: "MISSING_SQL", error: "Run the Amazon stock sync SQL first." };
  }
  const features = Array.isArray(org?.enabled_features) ? org.enabled_features : [];
  if (!features.includes(FEATURE)) {
    return { ok: false, code: "FEATURE_OFF", error: "Amazon stock sync is not turned on for this shop by Platform Admin." };
  }
  if (!settings?.enabled) return { ok: false, code: "OFF", error: "Amazon stock sync is switched off." };
  if (!isValidSellerId(settings.seller_id)) {
    return { ok: false, code: "NO_SELLER_ID", error: "Add your Amazon Seller ID (Merchant Token) first." };
  }
  if (!secrets?.lwa_client_id || !secrets?.lwa_client_secret || !secrets?.refresh_token) {
    return { ok: false, code: "NO_KEYS", error: "Add the Amazon app keys first." };
  }
  return {
    ok: true,
    shop: {
      orgId,
      sellerId: String(settings.seller_id).trim().toUpperCase(),
      marketplaceId: settings.marketplace_id || AMAZON_IN_MARKETPLACE_ID,
      defaultBuffer: Number(settings.default_buffer) || 0,
      clientId: secrets.lwa_client_id,
      clientSecret: secrets.lwa_client_secret,
      refreshToken: secrets.refresh_token,
    },
  };
}

async function getAccessToken(shop: Pick<Shop, "clientId" | "clientSecret" | "refreshToken">): Promise<{ token: string } | { error: string }> {
  try {
    const resp = await fetch(LWA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: shop.refreshToken,
        client_id: shop.clientId,
        client_secret: shop.clientSecret,
      }).toString(),
    });
    // deno-lint-ignore no-explicit-any
    const data: any = await resp.json().catch(() => null);
    if (!resp.ok || !data?.access_token) {
      const why = String(data?.error_description || data?.error || `HTTP ${resp.status}`).slice(0, 200);
      return { error: `Amazon login failed: ${why}. Check the client id, client secret and refresh token.` };
    }
    return { token: String(data.access_token) };
  } catch (e) {
    return { error: `Could not reach Amazon: ${(e as Error).message}` };
  }
}

async function saveStatus(db: Db, orgId: string, ok: boolean, message: string): Promise<void> {
  await db
    .from("amazon_channel_settings")
    .update({ last_sync_at: new Date().toISOString(), last_sync_ok: ok, last_sync_message: message.slice(0, 500) })
    .eq("organization_id", orgId);
}

type MapRow = {
  id: string;
  seller_sku: string;
  product_id: string;
  color: string | null;
  size: string;
  buffer_qty: number | null;
  last_pushed_qty: number | null;
  last_pushed_at: string | null;
  stock_changed_at: string;
};

const groupKey = (productId: string, color: string | null, size: string) => `${productId}|${color ?? "\u0000"}|${size}`;

/** Ezzy stock per product + colour + size, summed over all its live barcodes. */
async function stockByGroup(db: Db, orgId: string, rows: MapRow[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const productIds = [...new Set(rows.map((r) => r.product_id))];
  for (let i = 0; i < productIds.length; i += 100) {
    const { data, error } = await db
      .from("product_variants")
      .select("product_id, color, size, stock_qty, active")
      .eq("organization_id", orgId)
      .in("product_id", productIds.slice(i, i + 100))
      .is("deleted_at", null);
    if (error) throw new Error(`Could not read stock: ${error.message}`);
    for (const v of data ?? []) {
      if (v.active === false) continue;
      const k = groupKey(v.product_id, v.color ?? null, v.size);
      out.set(k, (out.get(k) ?? 0) + (Number(v.stock_qty) || 0));
    }
  }
  return out;
}

type SyncSummary = { sent: number; same: number; failed: number; waiting: boolean; message: string };

async function syncShop(db: Db, shop: Shop, opts: { deadline: number }): Promise<SyncSummary> {
  const { data: rows, error } = await db
    .from("amazon_sku_map")
    .select("id, seller_sku, product_id, color, size, buffer_qty, last_pushed_qty, last_pushed_at, stock_changed_at")
    .eq("organization_id", shop.orgId)
    .eq("active", true)
    .eq("needs_push", true)
    .order("stock_changed_at", { ascending: true })
    .limit(SKUS_PER_RUN);
  if (error) throw new Error(`Could not read the SKU list: ${error.message}`);
  const list = (rows ?? []) as MapRow[];
  if (list.length === 0) return { sent: 0, same: 0, failed: 0, waiting: false, message: "Nothing waiting." };

  const auth = await getAccessToken(shop);
  if ("error" in auth) return { sent: 0, same: 0, failed: 0, waiting: true, message: auth.error };

  const stock = await stockByGroup(db, shop.orgId, list);
  let sent = 0;
  let same = 0;
  let failed = 0;
  let stopNote = "";

  for (const row of list) {
    if (Date.now() > opts.deadline) {
      stopNote = " More waiting; the next run sends them.";
      break;
    }
    const stockQty = stock.get(groupKey(row.product_id, row.color, row.size)) ?? 0;
    const qty = amazonPushQty(stockQty, effectiveBuffer(row.buffer_qty, shop.defaultBuffer));
    const now = new Date().toISOString();

    if (row.last_pushed_at && row.last_pushed_qty === qty) {
      await db.from("amazon_sku_map").update({ last_stock_qty: stockQty, last_error: null }).eq("id", row.id);
      await db.from("amazon_sku_map").update({ needs_push: false }).eq("id", row.id).eq("stock_changed_at", row.stock_changed_at);
      same++;
      continue;
    }

    if (sent + failed > 0) await pause(PAUSE_MS);
    let status = 0;
    let body: unknown = null;
    try {
      const resp = await fetch(listingsItemUrl(shop.sellerId, row.seller_sku, shop.marketplaceId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-amz-access-token": auth.token, accept: "application/json" },
        body: JSON.stringify(buildQuantityPatch(qty)),
      });
      status = resp.status;
      body = await resp.json().catch(() => null);
    } catch (e) {
      stopNote = ` Could not reach Amazon: ${(e as Error).message}.`;
      break;
    }
    const outcome = readPushReply(status, body);
    if (outcome.kind === "retry") {
      stopNote = ` ${outcome.message}`;
      break;
    }
    if (outcome.kind === "ok") {
      await db
        .from("amazon_sku_map")
        .update({ last_stock_qty: stockQty, last_pushed_qty: qty, last_pushed_at: now, last_error: null, updated_at: now })
        .eq("id", row.id);
      sent++;
    } else {
      await db.from("amazon_sku_map").update({ last_stock_qty: stockQty, last_error: outcome.message, updated_at: now }).eq("id", row.id);
      failed++;
    }
    await db.from("amazon_sku_map").update({ needs_push: false }).eq("id", row.id).eq("stock_changed_at", row.stock_changed_at);
  }

  const parts = [`Sent ${sent}`];
  if (same) parts.push(`${same} unchanged`);
  if (failed) parts.push(`${failed} failed (see the SKU list)`);
  return { sent, same, failed, waiting: stopNote !== "", message: `${parts.join(", ")}.${stopNote}` };
}

async function runScheduled(db: Db): Promise<Response> {
  const started = Date.now();
  const { data: shops, error } = await db
    .from("amazon_channel_settings")
    .select("organization_id")
    .eq("enabled", true)
    .eq("has_keys", true);
  if (error) return json({ success: false, error: error.message }, 500);
  const done: Record<string, string> = {};
  for (const s of shops ?? []) {
    if (Date.now() - started > RUN_BUDGET_MS) break;
    const orgId = String(s.organization_id);
    try {
      const loaded = await loadShop(db, orgId);
      if (!loaded.ok) continue;
      const res = await syncShop(db, loaded.shop, { deadline: started + RUN_BUDGET_MS });
      if (res.sent + res.failed + res.same > 0 || res.waiting) {
        await saveStatus(db, orgId, res.failed === 0 && !res.waiting, res.message);
      }
      done[orgId] = res.message;
    } catch (e) {
      const msg = (e as Error).message;
      await saveStatus(db, orgId, false, msg);
      done[orgId] = msg;
    }
  }
  return json({ success: true, shops: done });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // deno-lint-ignore no-explicit-any
    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const action = String(body.action ?? "");

    if (action === "scheduled") {
      if (!(await isCronCall(req, body, db))) return json({ success: false, error: "Unauthorized" }, 401);
      return await runScheduled(db);
    }

    if (!["save_keys", "test", "sync_now", "resync_all"].includes(action)) {
      return json({ success: false, error: "Unknown action" }, 400);
    }
    const organizationId = String(body.organizationId ?? "");
    if (!UUID.test(organizationId)) return json({ success: false, error: "Invalid organizationId" }, 400);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "No authorization header" }, 401);
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) return json({ success: false, error: "Unauthorized" }, 401);

    const { data: membership } = await db
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership || membership.role !== "admin") {
      return json({ success: false, error: "Only the shop admin can change Amazon sync." }, 403);
    }

    const { data: org } = await db.from("organizations").select("enabled_features").eq("id", organizationId).maybeSingle();
    const features = Array.isArray(org?.enabled_features) ? org.enabled_features : [];
    if (!features.includes(FEATURE)) {
      return json({ success: false, code: "FEATURE_OFF", error: "Amazon stock sync is not turned on for this shop by Platform Admin." }, 403);
    }

    if (action === "save_keys") {
      const clientId = String(body.clientId ?? "").trim();
      const clientSecret = String(body.clientSecret ?? "").trim();
      const refreshToken = String(body.refreshToken ?? "").trim();
      if (!clientId.startsWith("amzn1.application-oa2-client.") || clientSecret.length < 20 || !refreshToken.startsWith("Atzr|")) {
        return json({
          success: false,
          error: "These don't look like Amazon app keys. The client id starts with amzn1.application-oa2-client. and the refresh token with Atzr|.",
        });
      }
      const check = await getAccessToken({ clientId, clientSecret, refreshToken });
      if ("error" in check) return json({ success: false, error: check.error });
      const now = new Date().toISOString();
      const { error: secretError } = await db.from("amazon_channel_secrets").upsert({
        organization_id: organizationId,
        lwa_client_id: clientId,
        lwa_client_secret: clientSecret,
        refresh_token: refreshToken,
        updated_by: user.id,
        updated_at: now,
      });
      if (secretError) {
        if (/amazon_channel_secrets|does not exist|schema cache/i.test(secretError.message || "")) {
          return json({ success: false, code: "MISSING_SQL", error: "Run the Amazon stock sync SQL first." });
        }
        return json({ success: false, error: `Could not save the keys: ${secretError.message}` });
      }
      await db.from("amazon_channel_settings").upsert({ organization_id: organizationId, has_keys: true, updated_at: now });
      return json({ success: true, message: "Keys saved. Amazon accepted the login." });
    }

    const loaded = await loadShop(db, organizationId);
    if (!loaded.ok) return json({ success: false, code: loaded.code, error: loaded.error });
    const shop = loaded.shop;

    if (action === "test") {
      const auth = await getAccessToken(shop);
      if ("error" in auth) return json({ success: false, error: auth.error });
      const resp = await fetch(`${SP_API_EU_ENDPOINT}/sellers/v1/marketplaceParticipations`, {
        headers: { "x-amz-access-token": auth.token, accept: "application/json" },
      });
      // deno-lint-ignore no-explicit-any
      const data: any = await resp.json().catch(() => null);
      if (!resp.ok) {
        const why = String(data?.errors?.[0]?.message ?? `HTTP ${resp.status}`).slice(0, 200);
        return json({ success: false, error: `Login works, but Amazon refused the seller check: ${why}` });
      }
      const list = Array.isArray(data?.payload) ? data.payload : [];
      const india = list.find((p: { marketplace?: { id?: string } }) => p?.marketplace?.id === shop.marketplaceId);
      if (!india) return json({ success: false, error: "Connected, but this seller account does not sell on Amazon.in." });
      return json({ success: true, message: "Connected to Amazon.in." });
    }

    if (action === "resync_all") {
      const { error: markError } = await db
        .from("amazon_sku_map")
        .update({ needs_push: true, last_pushed_qty: null, stock_changed_at: new Date().toISOString() })
        .eq("organization_id", organizationId)
        .eq("active", true);
      if (markError) return json({ success: false, error: `Could not mark SKUs: ${markError.message}` });
    }

    const res = await syncShop(db, shop, { deadline: Date.now() + RUN_BUDGET_MS });
    await saveStatus(db, organizationId, res.failed === 0 && !res.waiting, res.message);
    return json({ success: true, ...res });
  } catch (e) {
    console.error("amazon-sync error", e);
    return json({ success: false, error: (e as Error).message || "Something went wrong" }, 500);
  }
});
