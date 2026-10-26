import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isInternalDispatch,
  isServiceRoleRequest,
  parseDispatchTicketFromBody,
  parseDispatchTicketHeader,
} from "../_shared/internalDispatch.ts";
import { sendViaBuiltinGateway } from "../_shared/builtinGatewaySend.ts";
import { sendViaWappConnect } from "../_shared/wappConnectSend.ts";
import { loadCreditBlockReason } from "../_shared/whatsappCredits.ts";
import {
  AUTO_SENDS_PER_RUN,
  BIRTHDAY_WINDOW,
  inWindow,
  isSpecialDayToday,
  istDayStartIso,
  istNow,
  readWhatsAppAutoSettings,
  type SpecialDayKind,
  specialDayMessage,
  tenDigits,
  type WhatsAppAutoSettings,
} from "../_shared/whatsappAuto.ts";

// whatsapp-auto: automatic birthday / anniversary wishes.
// Payment reminders stay manual: a pending balance may be an advance taken against goods.
//   { type: "scheduled" }  pg_cron every 15 min (one-time ticket, dispatch_whatsapp_auto)
// Only shops on Ezzy ERP WhatsApp (builtin) or WappConnect: Meta needs approved templates.
// At most AUTO_SENDS_PER_RUN messages per shop per run, a few seconds apart.
// verify_jwt = false (config.toml); the cron ticket authenticates the call.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WISH_TYPE: Record<SpecialDayKind, string> = { birthday: "birthday_wish_auto", anniversary: "anniversary_wish_auto" };
const SENT = ["sent", "delivered", "read"];

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
type Db = any;

async function isCronCall(req: Request, body: unknown, db: Db): Promise<boolean> {
  if (isInternalDispatch(req) || isServiceRoleRequest(req)) return true;
  const ticket = parseDispatchTicketHeader(req) ?? parseDispatchTicketFromBody(body);
  if (!ticket) return false;
  const { data, error } = await db.rpc("consume_backup_dispatch_ticket", { p_id: ticket.id, p_token: ticket.token });
  return !error && data === true;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Shop = {
  orgId: string;
  provider: "builtin" | "wappconnect";
  instanceId: string;
  shopName: string;
  pointsOn: boolean;
  auto: WhatsAppAutoSettings;
};

type Sender = (phone10: string, text: string, templateType: string, referenceId: string) => Promise<boolean>;

function makeSender(db: Db, shop: Shop): Sender {
  let sentThisRun = 0;
  return async (phone10, text, templateType, referenceId) => {
    if (sentThisRun > 0) await pause(4000 + Math.floor(Math.random() * 5000));
    sentThisRun++;
    const to = `91${phone10}`;
    const result = shop.provider === "builtin"
      ? await sendViaBuiltinGateway(shop.orgId, to, { message: text })
      : await sendViaWappConnect(shop.instanceId, to, { message: text });
    const nowIso = new Date().toISOString();
    await db.from("whatsapp_logs").insert({
      organization_id: shop.orgId,
      phone_number: to,
      message: text,
      template_type: templateType,
      status: result.success ? "sent" : "failed",
      wamid: result.messageId || null,
      error_message: result.success ? null : String(result.error || "send failed"),
      reference_id: referenceId,
      reference_type: "customer",
      sent_at: nowIso,
      provider: shop.provider,
    });
    if (!result.success) console.error(`[whatsapp-auto] ${templateType} to ...${phone10.slice(-4)} failed:`, result.error);
    return result.success;
  };
}

/** Customers already handled (sent) since `sinceIso`, or failed twice today (no endless retries). */
async function handledCustomers(db: Db, orgId: string, templateType: string, sinceIso: string, todayStart: string): Promise<Set<string>> {
  const { data } = await db
    .from("whatsapp_logs")
    .select("reference_id, status, created_at")
    .eq("organization_id", orgId)
    .eq("template_type", templateType)
    .gte("created_at", sinceIso < todayStart ? sinceIso : todayStart)
    .not("reference_id", "is", null)
    .limit(5000);
  const done = new Set<string>();
  const failsToday = new Map<string, number>();
  for (const r of data ?? []) {
    const id = String(r.reference_id);
    if (SENT.includes(r.status) && r.created_at >= sinceIso) done.add(id);
    if (r.status === "failed" && r.created_at >= todayStart) {
      failsToday.set(id, (failsToday.get(id) ?? 0) + 1);
      if ((failsToday.get(id) ?? 0) >= 2) done.add(id);
    }
  }
  return done;
}

async function addBirthdayPoints(db: Db, shop: Shop, customerId: string, points: number, kind: SpecialDayKind, year: string) {
  const description = `${kind === "birthday" ? "Birthday" : "Anniversary"} bonus ${year}`;
  const { data: already } = await db
    .from("customer_points_history")
    .select("id")
    .eq("organization_id", shop.orgId)
    .eq("customer_id", customerId)
    .eq("description", description)
    .limit(1);
  if (already?.length) return;
  const { data: c } = await db.from("customers").select("points_balance").eq("id", customerId).maybeSingle();
  await db.from("customers").update({ points_balance: Number(c?.points_balance || 0) + points }).eq("id", customerId);
  await db.from("customer_points_history").insert({
    organization_id: shop.orgId,
    customer_id: customerId,
    transaction_type: "adjusted",
    points,
    description,
  });
}

async function sendWishes(db: Db, shop: Shop, send: Sender, budget: number, now: Date): Promise<number> {
  const today = istNow(now);
  // birthday / anniversary are date columns: PostgREST cannot match day+month, so read the
  // (small) set of customers who have either date and match here.
  const customers: Array<Record<string, any>> = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await db
      .from("customers")
      .select("id, customer_name, phone, birthday, anniversary")
      .eq("organization_id", shop.orgId)
      .is("deleted_at", null)
      .or("birthday.not.is.null,anniversary.not.is.null")
      .order("id")
      .range(from, from + 999);
    if (error) {
      console.error("[whatsapp-auto] customers failed:", shop.orgId, error.message);
      return 0;
    }
    for (const c of data ?? []) {
      if (isSpecialDayToday(c.birthday, today) || isSpecialDayToday(c.anniversary, today)) customers.push(c);
    }
    if ((data ?? []).length < 1000) break;
  }
  if (!customers.length) return 0;

  const { data: optouts } = await db.from("bulk_whatsapp_optouts").select("phone").eq("organization_id", shop.orgId);
  const optedOut = new Set((optouts ?? []).map((o: { phone: string }) => tenDigits(o.phone)));
  const yearStart = istDayStartIso(`${today.date.slice(0, 4)}-01-01`);
  const todayStart = istDayStartIso(today.date);
  const done: Record<SpecialDayKind, Set<string>> = {
    birthday: await handledCustomers(db, shop.orgId, WISH_TYPE.birthday, yearStart, todayStart),
    anniversary: await handledCustomers(db, shop.orgId, WISH_TYPE.anniversary, yearStart, todayStart),
  };

  let sent = 0;
  for (const c of customers) {
    const phone = tenDigits(c.phone);
    if (!phone || optedOut.has(phone)) continue;
    for (const kind of ["birthday", "anniversary"] as SpecialDayKind[]) {
      if (sent >= budget) return sent;
      if (!isSpecialDayToday(c[kind], today) || done[kind].has(c.id)) continue;
      const bonus = shop.pointsOn ? shop.auto.birthdayPoints : 0;
      const text = specialDayMessage({ kind, customerName: c.customer_name, shopName: shop.shopName, offer: shop.auto.birthdayOffer, bonusPoints: bonus });
      const ok = await send(phone, text, WISH_TYPE[kind], c.id);
      sent++;
      if (ok && bonus > 0) await addBirthdayPoints(db, shop, c.id, bonus, kind, today.date.slice(0, 4));
    }
  }
  return sent;
}

async function runScheduled(db: Db, now: Date) {
  const clock = istNow(now);
  if (!inWindow(clock.minutes, BIRTHDAY_WINDOW)) return [];

  const { data: rows } = await db
    .from("settings")
    .select("organization_id, business_name, sale_settings")
    .eq("sale_settings->>auto_birthday_wish_enabled", "true");

  const jobs = (rows ?? []).map(async (row: Record<string, any>) => {
    const orgId = row.organization_id as string;
    const auto = readWhatsAppAutoSettings(row.sale_settings);
    const { data: wa } = await db
      .from("whatsapp_api_settings")
      .select("is_active, send_provider")
      .eq("organization_id", orgId)
      .maybeSingle();
    const provider = String(wa?.send_provider ?? "");
    if (!wa?.is_active || (provider !== "builtin" && provider !== "wappconnect")) return { orgId, skipped: "no linked number" };
    let instanceId = "";
    if (provider === "wappconnect") {
      const { data: secret } = await db.from("whatsapp_wappconnect_secrets").select("instance_id").eq("organization_id", orgId).maybeSingle();
      instanceId = String(secret?.instance_id ?? "").trim();
      if (!instanceId) return { orgId, skipped: "no WappConnect instance" };
    } else if (await loadCreditBlockReason(db, orgId)) {
      return { orgId, skipped: "message balance over" };
    }
    const shop: Shop = {
      orgId,
      provider,
      instanceId,
      shopName: String(row.business_name ?? "").trim(),
      pointsOn: row.sale_settings?.enable_points_system === true,
      auto,
    };
    const send = makeSender(db, shop);
    let wishes = 0;
    try {
      wishes = await sendWishes(db, shop, send, AUTO_SENDS_PER_RUN, now);
    } catch (err) {
      console.error("[whatsapp-auto] shop failed:", orgId, err);
    }
    return { orgId, wishes };
  });
  return await Promise.all(jobs);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (!(await isCronCall(req, body, db))) return json(401, { error: "Unauthorized" });
  if (body.type !== "scheduled") return json(400, { error: "Unknown type" });
  const results = await runScheduled(db, new Date());
  return json(200, { ok: true, results });
});
