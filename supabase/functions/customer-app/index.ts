import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildCustomerTransactions,
  cleanSubdomain,
  clientIp,
  deriveSessionSecret,
  lineTax,
  maskPhone,
  phoneLast10,
  pointsRulesFromSaleSettings,
  reviewBlockReason,
  reviewInputFromBody,
  shopProfileFromSettings,
  storefrontUrlFor,
  signSessionToken,
  verifySessionToken,
} from "../_shared/customerApp.ts";

// ---------------------------------------------------------------------------
// customer-app: the shop customer's own account in the customer PWA
// (<shop>.<customer-domain>). verify_jwt = false: customers have no Supabase
// login. Every data action needs a customer-app session token (HMAC-signed,
// see _shared/customerApp.ts) and is scoped to that session's organization +
// customer with the service role. These tokens are not portal_sessions rows,
// so the B2B portal functions (catalogue / orders) never accept them.
//
// Login is by mobile number only (shop's choice, no OTP). Every attempt is
// recorded in customer_app_login_attempts and limited per IP, per mobile and
// per shop. A bill link never logs anyone in: links are made to be forwarded.
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SESSION_DAYS = 30;
const PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LIMITS = {
  perIp: { max: 10, windowMs: 10 * 60_000 },
  perMobile: { max: 5, windowMs: 10 * 60_000 },
  /** Failed logins per shop: bounds guessing which mobiles have accounts. */
  failedPerShop: { max: 100, windowMs: 60 * 60_000 },
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Org = { id: string; name: string };
type Session = { organizationId: string; customerId: string };

async function resolveOrg(supabase: SupabaseClient, subdomain: string): Promise<Org | null> {
  if (!subdomain) return null;
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("public_subdomain", subdomain)
    .maybeSingle();
  if (!org) return null;
  const { data: settings } = await supabase
    .from("customer_page_settings")
    .select("enabled")
    .eq("organization_id", org.id)
    .maybeSingle();
  return settings?.enabled ? (org as Org) : null;
}

let sessionSecret: string | null = null;

async function getSessionSecret(): Promise<string> {
  if (!sessionSecret) {
    const explicit = Deno.env.get("CUSTOMER_APP_SESSION_SECRET");
    sessionSecret = explicit && explicit.length >= 32
      ? explicit
      : await deriveSessionSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  }
  return sessionSecret;
}

async function createSession(orgId: string, customerId: string): Promise<string> {
  return signSessionToken(
    { organizationId: orgId, customerId, expiresAt: Date.now() + SESSION_DAYS * 86_400_000 },
    await getSessionSecret(),
  );
}

async function readSession(supabase: SupabaseClient, orgId: string, token: unknown): Promise<Session | null> {
  const s = await verifySessionToken(token, await getSessionSecret(), orgId);
  if (!s) return null;
  // Customer removed / deleted since login → session no longer valid.
  const { data } = await supabase
    .from("customers")
    .select("id")
    .eq("id", s.customerId)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? { organizationId: orgId, customerId: s.customerId } : null;
}

/**
 * Records this attempt FIRST (as failed), then counts recent attempts including it. Because
 * every request's own row is committed before its count, the n-th concurrent request sees at
 * least n rows, so parallel bursts cannot slip past the caps (check-then-insert could).
 * Returns the attempt id when allowed, "blocked" when over a cap, null when the limiter is
 * unavailable (caller fails closed).
 */
async function reserveLoginAttempt(
  supabase: SupabaseClient,
  orgId: string,
  ip: string,
  last10: string,
): Promise<number | "blocked" | null> {
  const { data: row, error: insertError } = await supabase
    .from("customer_app_login_attempts")
    .insert({ organization_id: orgId, ip, phone_last10: last10, success: false })
    .select("id")
    .single();
  if (insertError || !row) {
    console.error("customer-app: could not record login attempt", insertError);
    return null;
  }
  const since = (ms: number) => new Date(Date.now() - ms).toISOString();
  const head = { count: "exact" as const, head: true };
  const [byIp, byMobile, failedShop] = await Promise.all([
    supabase
      .from("customer_app_login_attempts")
      .select("id", head)
      .eq("ip", ip)
      .gte("created_at", since(LIMITS.perIp.windowMs)),
    supabase
      .from("customer_app_login_attempts")
      .select("id", head)
      .eq("organization_id", orgId)
      .eq("phone_last10", last10)
      .gte("created_at", since(LIMITS.perMobile.windowMs)),
    supabase
      .from("customer_app_login_attempts")
      .select("id", head)
      .eq("organization_id", orgId)
      .eq("success", false)
      .gte("created_at", since(LIMITS.failedPerShop.windowMs)),
  ]);
  if (byIp.error || byMobile.error || failedShop.error) {
    console.error("customer-app: login limiter unavailable", byIp.error ?? byMobile.error ?? failedShop.error);
    return null;
  }
  // Counts include this request's own row, hence ">".
  const over =
    (byIp.count ?? 0) > LIMITS.perIp.max ||
    (byMobile.count ?? 0) > LIMITS.perMobile.max ||
    (failedShop.count ?? 0) > LIMITS.failedPerShop.max;
  return over ? "blocked" : (row.id as number);
}

/** Customer in this shop with this mobile; when several share it, the one billed most recently. */
async function findCustomerByMobile(supabase: SupabaseClient, orgId: string, last10: string) {
  const { data: rows } = await supabase
    .from("customers")
    .select("id, customer_name, phone")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .ilike("phone", `%${last10}`)
    .limit(20);
  const matches = (rows ?? []).filter((c) => phoneLast10(c.phone) === last10);
  if (matches.length <= 1) return matches[0] ?? null;
  const { data: latest } = await supabase
    .from("sales")
    .select("customer_id")
    .eq("organization_id", orgId)
    .in("customer_id", matches.map((c) => c.id))
    .is("deleted_at", null)
    .order("sale_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return matches.find((c) => c.id === latest?.customer_id) ?? matches[0];
}

async function customerProfile(supabase: SupabaseClient, session: Session) {
  const { data } = await supabase
    .from("customers")
    .select("id, customer_name, phone, points_balance")
    .eq("id", session.customerId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  return data;
}

function saleBillQuery(supabase: SupabaseClient, session: Session) {
  return supabase
    .from("sales")
    .select(
      "id, sale_number, sale_date, customer_name, net_amount, paid_amount, payment_method, payment_status, " +
        "flat_discount_amount, round_off, tax_type, salesman, sale_return_adjust, total_qty, " +
        "cash_amount, upi_amount, card_amount",
    )
    .eq("organization_id", session.organizationId)
    .eq("customer_id", session.customerId)
    .is("deleted_at", null)
    .eq("is_cancelled", false);
}

/** Public shop header: name, logo, address, phone, and the shop's website link when it has one. */
async function shopHeader(supabase: SupabaseClient, org: Org) {
  const [{ data: settings }, { data: website }] = await Promise.all([
    supabase
      .from("settings")
      .select("business_name, address, mobile_number, bill_barcode_settings")
      .eq("organization_id", org.id)
      .maybeSingle(),
    supabase
      .from("website_settings")
      .select("slug, custom_domain, is_published")
      .eq("organization_id", org.id)
      .maybeSingle(),
  ]);
  return { ...shopProfileFromSettings(org.name, settings), store_url: storefrontUrlFor(website) };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const org = await resolveOrg(supabase, cleanSubdomain(body.subdomain));
    if (!org) return json(404, { error: "shop_not_found" });

    // ─── SHOP: public header (name, logo, address, phone), no session ─────
    if (action === "shop") {
      return json(200, { ok: true, shop: await shopHeader(supabase, org) });
    }

    // ─── OFFER: one offer by id, no session (a notification tap opens it) ──
    // Offers are what the shop sends to everyone who turned on notifications, so this
    // is public like the shop header. Scoped to this shop; drafts are never returned.
    if (action === "offer") {
      const campaignId = String(body.campaignId ?? "");
      if (!UUID.test(campaignId)) return json(400, { error: "offer_not_found" });
      const [{ data: offer, error }, shop] = await Promise.all([
        supabase
          .from("push_campaigns")
          .select("id, title, body, image_url, offer_code, valid_till, created_at")
          .eq("id", campaignId)
          .eq("organization_id", org.id)
          .in("status", ["sending", "done"])
          .maybeSingle(),
        shopHeader(supabase, org),
      ]);
      if (error) throw error;
      if (!offer) return json(404, { error: "offer_not_found" });
      return json(200, { ok: true, offer, shop });
    }

    // ─── LOGIN: mobile number ──────────────────────────────────────────────
    if (action === "login") {
      const last10 = phoneLast10(body.mobile);
      if (!last10) return json(400, { error: "invalid_mobile" });
      const ip = clientIp(req.headers);
      const attempt = await reserveLoginAttempt(supabase, org.id, ip, last10);
      if (attempt === null) return json(503, { error: "login_unavailable" });
      if (attempt === "blocked") return json(429, { error: "too_many_attempts" });
      const customer = await findCustomerByMobile(supabase, org.id, last10);
      if (customer) {
        // Successful logins don't count toward the per-shop failed cap.
        await supabase.from("customer_app_login_attempts").update({ success: true }).eq("id", attempt);
      }
      if (!customer) return json(404, { error: "no_account" });
      const token = await createSession(org.id, customer.id);
      return json(200, {
        ok: true,
        token,
        customer: { name: customer.customer_name, phone: maskPhone(customer.phone) },
        shop: org.name,
      });
    }

    // Everything below needs a session.
    const session = await readSession(supabase, org.id, body.token);
    if (!session) return json(401, { error: "session_expired" });

    if (action === "summary") {
      const profile = await customerProfile(supabase, session);
      if (!profile) return json(401, { error: "session_expired" });
      const [{ data: snap }, { data: sales }, { data: returns }, { data: saleSettingsRow }] = await Promise.all([
        supabase.rpc("get_customer_financial_snapshot", {
          p_customer_id: session.customerId,
          p_organization_id: session.organizationId,
        }),
        saleBillQuery(supabase, session).limit(5000),
        supabase
          .from("sale_returns")
          .select("net_amount")
          .eq("organization_id", session.organizationId)
          .eq("customer_id", session.customerId)
          .is("deleted_at", null),
        supabase.from("settings").select("sale_settings").eq("organization_id", session.organizationId).maybeSingle(),
      ]);
      const pointsRules = pointsRulesFromSaleSettings(saleSettingsRow?.sale_settings);
      const s = (Array.isArray(snap) ? snap[0] : snap) as
        | { outstanding_dr?: number; advance_available?: number; cn_available_total?: number }
        | null;
      const billRows = (sales ?? []) as unknown as Array<{ net_amount: number | null; total_qty: number | null }>;
      return json(200, {
        ok: true,
        shop: org.name,
        customer: {
          name: profile.customer_name,
          phone: maskPhone(profile.phone),
          points: Number(profile.points_balance) || 0,
        },
        rewards: { enabled: pointsRules.enabled, pointValue: pointsRules.redemptionEnabled ? pointsRules.pointValue : 0 },
        totals: {
          bills: billRows.length,
          shopping: Math.round(billRows.reduce((t, r) => t + (Number(r.net_amount) || 0), 0)),
          items: billRows.reduce((t, r) => t + (Number(r.total_qty) || 0), 0),
          returns: (returns ?? []).length,
          returnAmount: Math.round((returns ?? []).reduce((t, r) => t + (Number(r.net_amount) || 0), 0)),
        },
        balance: {
          outstanding: Math.max(0, Math.round(Number(s?.outstanding_dr) || 0)),
          advance: Math.max(0, Math.round(Number(s?.advance_available) || 0)),
          creditNotes: Math.max(0, Math.round(Number(s?.cn_available_total) || 0)),
        },
      });
    }

    if (action === "bills") {
      const page = Math.max(0, Math.floor(Number(body.page) || 0));
      const { data, error } = await saleBillQuery(supabase, session)
        .order("sale_date", { ascending: false })
        .order("sale_number", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
      return json(200, {
        ok: true,
        hasMore: rows.length === PAGE_SIZE,
        bills: rows.map((r) => ({
          id: r.id,
          sale_number: r.sale_number,
          sale_date: r.sale_date,
          net_amount: Number(r.net_amount) || 0,
          paid_amount: Number(r.paid_amount) || 0,
          payment_status: r.payment_status,
          total_qty: Number(r.total_qty) || 0,
        })),
      });
    }

    if (action === "bill") {
      const saleId = String(body.saleId ?? "");
      if (!UUID.test(saleId)) return json(400, { error: "invalid_bill" });
      const { data: saleRow } = await saleBillQuery(supabase, session).eq("id", saleId).maybeSingle();
      if (!saleRow) return json(404, { error: "bill_not_found" });
      const sale = saleRow as unknown as Record<string, unknown>;
      const [{ data: items }, { data: review }] = await Promise.all([
        supabase
          .from("sale_items")
          .select("product_name, size, color, quantity, unit_price, mrp, discount_percent, gst_percent, line_total")
          .eq("sale_id", saleId)
          .is("deleted_at", null)
          .order("created_at", { ascending: true }),
        supabase
          .from("customer_feedback")
          .select("rating, tags, comment, source, created_at")
          .eq("organization_id", session.organizationId)
          .eq("sale_id", saleId)
          .maybeSingle(),
      ]);
      const lines = (items ?? []).map((it) => {
        const amount = Number(it.line_total) || 0;
        const { taxable, tax } = lineTax(amount, Number(it.gst_percent) || 0, sale.tax_type as string);
        return {
          name: it.product_name,
          size: it.size,
          colour: it.color,
          qty: Number(it.quantity) || 0,
          rate: Number(it.unit_price) || 0,
          mrp: Number(it.mrp) || 0,
          discount_percent: Number(it.discount_percent) || 0,
          gst_percent: Number(it.gst_percent) || 0,
          amount,
          taxable,
          tax,
        };
      });
      const r2 = (n: number) => Math.round(n * 100) / 100;
      return json(200, {
        ok: true,
        shop: org.name,
        sale: {
          id: sale.id,
          sale_number: sale.sale_number,
          sale_date: sale.sale_date,
          customer_name: sale.customer_name,
          items: lines,
          taxable_value: r2(lines.reduce((t, l) => t + l.taxable, 0)),
          tax_total: r2(lines.reduce((t, l) => t + l.tax, 0)),
          discount_amount: Number(sale.flat_discount_amount) || 0,
          sale_return_adjust: Number(sale.sale_return_adjust) || 0,
          round_off: Number(sale.round_off) || 0,
          net_amount: Number(sale.net_amount) || 0,
          paid_amount: Number(sale.paid_amount) || 0,
          payment_method: sale.payment_method,
          payment_status: sale.payment_status,
          salesman: sale.salesman ?? null,
        },
        review: review ?? null,
      });
    }

    // ─── REVIEWS: the stars this customer gave, newest first ──────────────
    if (action === "reviews") {
      const { data: bills } = await supabase
        .from("sales")
        .select("id, sale_number, sale_date, net_amount")
        .eq("organization_id", session.organizationId)
        .eq("customer_id", session.customerId)
        .is("deleted_at", null)
        .eq("is_cancelled", false)
        .order("sale_date", { ascending: false })
        .limit(200);
      const byId = new Map((bills ?? []).map((b) => [b.id as string, b]));
      const { data: rows, error } = byId.size
        ? await supabase
          .from("customer_feedback")
          .select("id, sale_id, rating, tags, comment, source, created_at")
          .eq("organization_id", session.organizationId)
          .in("sale_id", [...byId.keys()])
          .order("created_at", { ascending: false })
        : { data: [], error: null };
      if (error) throw error;
      const reviews = (rows ?? []).map((r) => {
        const b = byId.get(r.sale_id as string);
        return { ...r, sale_number: b?.sale_number ?? null, sale_date: b?.sale_date ?? null };
      });
      const rated = new Set(reviews.map((r) => r.sale_id));
      // Recent bills still waiting for stars, so the page can ask for them.
      const unrated = (bills ?? [])
        .filter((b) => !rated.has(b.id) && !reviewBlockReason(b.sale_date as string, null))
        .slice(0, 5)
        .map((b) => ({ id: b.id, sale_number: b.sale_number, sale_date: b.sale_date, net_amount: Number(b.net_amount) || 0 }));
      return json(200, { ok: true, reviews, unrated });
    }

    // ─── RATE: stars + tags + comment on one of this customer's bills ─────
    if (action === "rate") {
      const saleId = String(body.saleId ?? "");
      if (!UUID.test(saleId)) return json(400, { error: "invalid_bill" });
      const input = reviewInputFromBody(body);
      if (!input) return json(400, { error: "invalid_rating" });
      const { data: sale } = await supabase
        .from("sales")
        .select("id, sale_date, salesman")
        .eq("organization_id", session.organizationId)
        .eq("customer_id", session.customerId)
        .eq("id", saleId)
        .is("deleted_at", null)
        .eq("is_cancelled", false)
        .maybeSingle();
      if (!sale) return json(404, { error: "bill_not_found" });
      const { data: existing } = await supabase
        .from("customer_feedback")
        .select("id, source, created_at")
        .eq("sale_id", saleId)
        .maybeSingle();
      const blocked = reviewBlockReason(sale.sale_date as string, existing);
      if (blocked) return json(409, { error: blocked });
      const now = new Date().toISOString();
      const { error } = existing
        ? await supabase
          .from("customer_feedback")
          .update({ ...input, updated_at: now })
          .eq("id", existing.id)
        : await supabase.from("customer_feedback").insert({
          ...input,
          organization_id: session.organizationId,
          sale_id: saleId,
          salesman: sale.salesman ?? null,
          source: "customer_app",
        });
      if (error) {
        console.error("customer-app rate failed", error);
        return json(400, { error: "rate_failed" });
      }
      return json(200, { ok: true });
    }

    if (action === "returns") {
      const { data, error } = await supabase
        .from("sale_returns")
        .select("id, return_number, return_date, net_amount, original_sale_number, refund_type, credit_status")
        .eq("organization_id", session.organizationId)
        .eq("customer_id", session.customerId)
        .is("deleted_at", null)
        .order("return_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return json(200, { ok: true, returns: data ?? [] });
    }

    if (action === "transactions") {
      const { data: sales } = await saleBillQuery(supabase, session)
        .order("sale_date", { ascending: false })
        .limit(300);
      const saleRows = (sales ?? []) as unknown as Array<{
        id: string;
        sale_number: string;
        sale_date: string;
        net_amount: number | null;
        paid_amount: number | null;
      }>;
      const saleIds = saleRows.map((s) => s.id);
      const voucherCols = "id, voucher_number, voucher_date, total_amount, payment_method";
      const [byCustomer, bySale, returns] = await Promise.all([
        supabase
          .from("voucher_entries")
          .select(voucherCols)
          .eq("organization_id", session.organizationId)
          .eq("voucher_type", "receipt")
          .eq("reference_type", "customer")
          .eq("reference_id", session.customerId)
          .is("deleted_at", null)
          .limit(300),
        saleIds.length
          ? supabase
            .from("voucher_entries")
            .select(voucherCols)
            .eq("organization_id", session.organizationId)
            .eq("voucher_type", "receipt")
            .eq("reference_type", "sale")
            .in("reference_id", saleIds)
            .is("deleted_at", null)
            .limit(300)
          : Promise.resolve({ data: [] }),
        supabase
          .from("sale_returns")
          .select("return_number, return_date, net_amount, original_sale_number")
          .eq("organization_id", session.organizationId)
          .eq("customer_id", session.customerId)
          .is("deleted_at", null)
          .limit(300),
      ]);
      const seen = new Set<string>();
      const receipts = [...(byCustomer.data ?? []), ...(bySale.data ?? [])].filter((v) => {
        if (seen.has(v.id)) return false;
        seen.add(v.id);
        return true;
      });
      return json(200, {
        ok: true,
        transactions: buildCustomerTransactions(saleRows, receipts, returns.data ?? []).slice(0, 500),
      });
    }

    // ─── POINTS: reward points balance, the shop's rules, gifts and history ──
    if (action === "points") {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: profile }, { data: settings }, { data: history }, { data: gifts }] = await Promise.all([
        supabase
          .from("customers")
          .select("points_balance, total_points_earned, points_redeemed")
          .eq("id", session.customerId)
          .eq("organization_id", session.organizationId)
          .maybeSingle(),
        supabase.from("settings").select("sale_settings").eq("organization_id", session.organizationId).maybeSingle(),
        supabase
          .from("customer_points_history")
          .select("id, transaction_type, points, invoice_amount, description, created_at")
          .eq("organization_id", session.organizationId)
          .eq("customer_id", session.customerId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("gift_rewards")
          .select("id, gift_name, description, points_required, valid_until")
          .eq("organization_id", session.organizationId)
          .eq("is_active", true)
          .gt("stock_qty", 0)
          .lte("valid_from", today)
          .or(`valid_until.is.null,valid_until.gte.${today}`)
          .order("points_required", { ascending: true })
          .limit(20),
      ]);
      if (!profile) return json(401, { error: "session_expired" });
      return json(200, {
        ok: true,
        balance: Math.max(0, Number(profile.points_balance) || 0),
        earned: Math.max(0, Number(profile.total_points_earned) || 0),
        redeemed: Math.max(0, Number(profile.points_redeemed) || 0),
        rules: pointsRulesFromSaleSettings(settings?.sale_settings),
        gifts: gifts ?? [],
        history: history ?? [],
      });
    }

    if (action === "offers") {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("push_campaigns")
        .select("id, title, body, image_url, offer_code, valid_till, created_at")
        .eq("organization_id", session.organizationId)
        .in("status", ["sending", "done"])
        .or(`valid_till.is.null,valid_till.gte.${today}`)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return json(200, { ok: true, offers: data ?? [] });
    }

    // Logged-in customer turns on notifications (no bill link needed).
    if (action === "register_push") {
      const fcmToken = String(body.fcmToken ?? "").trim();
      const platform = ["android", "ios", "web"].includes(body.platform) ? body.platform : "web";
      if (fcmToken.length < 20 || fcmToken.length > 4096) return json(400, { error: "invalid_token" });
      const profile = await customerProfile(supabase, session);
      const last10 = phoneLast10(profile?.phone);
      if (!last10) return json(400, { error: "no_mobile" });
      const now = new Date().toISOString();
      const fields = {
        customer_id: session.customerId,
        customer_phone_last10: last10,
        platform,
        status: "confirmed",
        confirmed_at: now,
        last_seen_at: now,
        receives_invoices: true,
        inactive_reason: null,
      };
      const { data: existing } = await supabase
        .from("push_subscriptions")
        .select("id")
        .eq("organization_id", session.organizationId)
        .eq("fcm_token", fcmToken)
        .maybeSingle();
      const { error } = existing
        ? await supabase.from("push_subscriptions").update(fields).eq("id", existing.id)
        : await supabase
          .from("push_subscriptions")
          .insert({ ...fields, organization_id: session.organizationId, fcm_token: fcmToken, source: "customer_app" });
      if (error) {
        console.error("customer-app register_push failed", error);
        return json(400, { error: "register_failed" });
      }
      return json(200, { ok: true });
    }

    return json(400, { error: "unknown_action" });
  } catch (error) {
    console.error("Error in customer-app function:", error);
    return json(500, { error: "internal_error" });
  }
};

Deno.serve(handler);
