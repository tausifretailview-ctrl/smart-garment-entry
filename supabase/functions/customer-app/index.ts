import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildCustomerTransactions,
  cleanSubdomain,
  createRateLimiter,
  lineTax,
  maskPhone,
  phoneLast10,
} from "../_shared/customerApp.ts";

// ---------------------------------------------------------------------------
// customer-app: the shop customer's own account in the customer PWA
// (<shop>.<customer-domain>). verify_jwt = false: customers have no Supabase
// login. Every data action needs a portal_sessions token and is scoped to that
// session's organization + customer with the service role.
//
// Login is by mobile number (shop's choice, no OTP), or automatically from a
// valid bill link token (/t/<token>), which already proves the phone.
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SESSION_DAYS = 30;
const PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Per instance: 10 login attempts / 10 min per IP, 5 per mobile.
const ipLimiter = createRateLimiter(10, 10 * 60 * 1000);
const mobileLimiter = createRateLimiter(5, 10 * 60 * 1000);

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

async function createSession(supabase: SupabaseClient, orgId: string, customerId: string): Promise<string> {
  const sessionToken = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const { error } = await supabase.from("portal_sessions").insert({
    organization_id: orgId,
    customer_id: customerId,
    session_token: sessionToken,
    expires_at: new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString(),
  });
  if (error) throw new Error(`session: ${error.message}`);
  return sessionToken;
}

async function readSession(supabase: SupabaseClient, orgId: string, token: unknown): Promise<Session | null> {
  const t = String(token ?? "");
  if (t.length < 20 || t.length > 200) return null;
  const { data } = await supabase
    .from("portal_sessions")
    .select("organization_id, customer_id, expires_at")
    .eq("session_token", t)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) return null;
  return { organizationId: data.organization_id, customerId: data.customer_id };
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

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const org = await resolveOrg(supabase, cleanSubdomain(body.subdomain));
    if (!org) return json(404, { error: "shop_not_found" });

    // ─── LOGIN: mobile number ──────────────────────────────────────────────
    if (action === "login") {
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
      const last10 = phoneLast10(body.mobile);
      if (!last10) return json(400, { error: "invalid_mobile" });
      if (!ipLimiter(ip) || !mobileLimiter(`${org.id}:${last10}`)) {
        return json(429, { error: "too_many_attempts" });
      }
      const customer = await findCustomerByMobile(supabase, org.id, last10);
      if (!customer) return json(404, { error: "no_account" });
      // DB-backed limit (survives instance restarts): max 10 sessions / hour per customer.
      const { count } = await supabase
        .from("portal_sessions")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customer.id)
        .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
      if ((count ?? 0) >= 10) return json(429, { error: "too_many_attempts" });
      const token = await createSession(supabase, org.id, customer.id);
      return json(200, {
        ok: true,
        token,
        customer: { name: customer.customer_name, phone: maskPhone(customer.phone) },
        shop: org.name,
      });
    }

    // ─── LOGIN: from a bill link token (/t/<token>) ─────────────────────────
    if (action === "login_bill") {
      const billToken = String(body.billToken ?? "");
      if (!/^[A-Za-z0-9_-]{8,200}$/.test(billToken)) return json(400, { error: "invalid_link" });
      const { data: page, error: pageError } = await supabase.rpc("customer_page_get", {
        p_subdomain: cleanSubdomain(body.subdomain),
        p_token: billToken,
      });
      const saleNumber = (page as { sale?: { sale_number?: string } | null } | null)?.sale?.sale_number;
      if (pageError || !saleNumber) return json(404, { error: "link_expired" });
      const { data: sale } = await supabase
        .from("sales")
        .select("customer_id, customer_phone")
        .eq("organization_id", org.id)
        .eq("sale_number", saleNumber)
        .is("deleted_at", null)
        .maybeSingle();
      let customerId = sale?.customer_id as string | null | undefined;
      if (!customerId && sale?.customer_phone) {
        const last10 = phoneLast10(sale.customer_phone);
        customerId = last10 ? (await findCustomerByMobile(supabase, org.id, last10))?.id : null;
      }
      if (!customerId) return json(404, { error: "no_account" });
      const token = await createSession(supabase, org.id, customerId);
      const profile = await customerProfile(supabase, { organizationId: org.id, customerId });
      return json(200, {
        ok: true,
        token,
        customer: { name: profile?.customer_name ?? "", phone: maskPhone(profile?.phone) },
        shop: org.name,
      });
    }

    // Everything below needs a session.
    const session = await readSession(supabase, org.id, body.token);
    if (!session) return json(401, { error: "session_expired" });

    if (action === "logout") {
      await supabase.from("portal_sessions").delete().eq("session_token", String(body.token));
      return json(200, { ok: true });
    }

    if (action === "summary") {
      const profile = await customerProfile(supabase, session);
      if (!profile) return json(401, { error: "session_expired" });
      const [{ data: snap }, { data: sales }, { data: returns }] = await Promise.all([
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
      ]);
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
      const { data: items } = await supabase
        .from("sale_items")
        .select("product_name, size, color, quantity, unit_price, mrp, discount_percent, gst_percent, line_total")
        .eq("sale_id", saleId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
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
      });
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
