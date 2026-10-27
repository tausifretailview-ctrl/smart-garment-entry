import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isInternalDispatch,
  isServiceRoleRequest,
  parseDispatchTicketFromBody,
  parseDispatchTicketHeader,
} from "../_shared/internalDispatch.ts";
import { parseServiceAccount, sendFcmAndroidNotification, type ServiceAccount } from "../_shared/fcm.ts";
import {
  type CashierTotals,
  type OwnerAlertSettings,
  type SalesmanTotal,
  cashierMessage,
  dayEndMessage,
  dueCashierSlot,
  dueDayEndSlot,
  dueLowStockSlot,
  invoiceMessage,
  istClock,
  istDayStartUtc,
  lowStockMessage,
  REVIEW_LOOKBACK_MIN,
  reviewMessage,
  salesmanTotals,
  shouldSendInvoiceAlert,
  slotMinutes,
} from "../_shared/ownerAlertSchedule.ts";

// owner-alerts: phone notifications for shop owners (Android app, FCM).
//   { type: "scheduled" }              pg_cron every 15 min (one-time ticket) → cashier / low stock / day-end / new reviews
//   { type: "invoice", organizationId, saleId }   app, after a bill is saved (logged-in member)
//   { type: "test", organizationId }               Settings → "Send test alert" (logged-in member)
// verify_jwt = false (config.toml); every path authenticates itself.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

async function memberUserId(req: Request, db: Db, organizationId: string): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const { data: m } = await db
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();
  return m ? user.id : null;
}

/** Claim the alert key; false when already sent (unique violation) or on error. */
async function claim(db: Db, organizationId: string, kind: string, ref: string): Promise<string | null> {
  const { data, error } = await db
    .from("owner_push_log")
    .insert({ organization_id: organizationId, kind, ref })
    .select("id")
    .single();
  return error || !data ? null : data.id;
}

async function sendToOwners(
  db: Db,
  sa: ServiceAccount,
  organizationId: string,
  logId: string,
  msg: { title: string; body: string },
  data: Record<string, string>,
): Promise<{ sent: number; failed: number }> {
  const { data: devices } = await db
    .from("owner_push_devices")
    .select("id, fcm_token")
    .eq("organization_id", organizationId)
    .eq("status", "active");
  let sent = 0;
  let failed = 0;
  for (const d of devices ?? []) {
    const r = await sendFcmAndroidNotification(sa, d.fcm_token, msg, data);
    if (r.ok) {
      sent++;
    } else {
      failed++;
      if (r.unregistered) {
        await db.from("owner_push_devices").update({ status: "inactive", inactive_reason: r.error.slice(0, 120) }).eq("id", d.id);
      }
    }
  }
  await db.from("owner_push_log").update({ sent_count: sent, failed_count: failed }).eq("id", logId);
  // Text + tap data for the app's Notifications page. Separate update: these columns
  // come from the notifications history SQL, and a shop without it must still log counts.
  const { error: textErr } = await db
    .from("owner_push_log")
    .update({ title: msg.title, body: msg.body, data })
    .eq("id", logId);
  if (textErr && !/column|schema cache/i.test(textErr.message ?? "")) {
    console.error("owner-alerts history text failed", textErr.message);
  }
  return { sent, failed };
}

/** Settings > Purchase "Hide DC" shops: alerts leave DC (No GST) bills out, like the screens do. */
async function hidesDc(db: Db, organizationId: string): Promise<boolean> {
  const { data } = await db.from("settings").select("purchase_settings").eq("organization_id", organizationId).maybeSingle();
  return data?.purchase_settings?.dc_visibility_mode === "hide";
}

/** DC line net and all-line net per bill, for bills that have a DC line. Errors (DC update not run) → empty. */
type DcLine = { sale_id: string; net_after_discount: number | null };
const LINE_PAGE = 1000;

/** All rows of a sale_items query, 1,000 (the per-request cap) at a time; null on error. */
async function allLinePages(build: () => any): Promise<DcLine[] | null> {
  const rows: DcLine[] = [];
  for (let from = 0; ; from += LINE_PAGE) {
    const { data, error } = await build().order("id").range(from, from + LINE_PAGE - 1);
    if (error) return null;
    rows.push(...((data ?? []) as DcLine[]));
    if (!data || data.length < LINE_PAGE) break;
  }
  return rows;
}

async function dcSharesBySale(db: Db, saleIds: string[]): Promise<Map<string, { dcNet: number; allNet: number }>> {
  const out = new Map<string, { dcNet: number; allNet: number }>();
  for (let i = 0; i < saleIds.length; i += 200) {
    const ids = saleIds.slice(i, i + 200);
    const dc = await allLinePages(() =>
      db.from("sale_items").select("sale_id, net_after_discount").in("sale_id", ids).eq("is_dc_item", true).is("deleted_at", null)
    );
    if (!dc?.length) continue;
    const withDc = [...new Set(dc.map((r) => r.sale_id))];
    // 200 bills with a DC line can hold more than 1,000 lines: page, or a bill looks all-DC and is dropped.
    const all = await allLinePages(() =>
      db.from("sale_items").select("sale_id, net_after_discount").in("sale_id", withDc).is("deleted_at", null)
    );
    if (all === null) continue;
    for (const r of dc) {
      const cur = out.get(r.sale_id) ?? { dcNet: 0, allNet: 0 };
      cur.dcNet += Number(r.net_after_discount) || 0;
      out.set(r.sale_id, cur);
    }
    for (const r of all) {
      const cur = out.get(r.sale_id);
      if (cur) cur.allNet += Number(r.net_after_discount) || 0;
    }
  }
  return out;
}

/** Bill amount without its DC lines (whole bill when it has none). 0 = every line is DC. */
function nonDcAmount(netAmount: number, share: { dcNet: number; allNet: number } | undefined): number {
  if (!share) return netAmount;
  if (share.allNet <= 0 || share.dcNet >= share.allNet) return 0;
  return Math.round(netAmount * ((share.allNet - share.dcNet) / share.allNet) * 100) / 100;
}

async function todayTotals(db: Db, organizationId: string, now: Date, hideDc = false): Promise<CashierTotals> {
  const { date } = istClock(now);
  const { data } = await db.rpc("get_pos_dashboard_stats", {
    p_organization_id: organizationId,
    p_date_from: istDayStartUtc(date).toISOString(),
    p_date_to: now.toISOString(),
    p_filters: hideDc ? { hideDc: true } : {},
  });
  const t = (data ?? {}) as Record<string, number>;
  const n = (k: string) => Number(t[k]) || 0;
  return {
    totalBills: n("totalBills"),
    totalAmount: n("totalAmount"),
    totalCash: n("totalCash"),
    totalUpi: n("totalUpi"),
    totalCard: n("totalCard"),
    totalBalance: n("totalBalance"),
    refundAmount: n("refundAmount"),
    totalSaleReturnAdjust: n("totalSaleReturnAdjust"),
  };
}

/** Today's bills per salesman (IST day so far), only when the shop turned the summary on. */
async function salesmenToday(
  db: Db,
  s: OwnerAlertSettings,
  organizationId: string,
  now: Date,
  hideDc = false,
): Promise<SalesmanTotal[] | undefined> {
  if (!s.salesman_summary_enabled) return undefined;
  const { date } = istClock(now);
  const { data, error } = await db
    .from("sales")
    .select("id, salesman, net_amount")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .eq("is_cancelled", false)
    .neq("payment_status", "hold")
    .gte("sale_date", istDayStartUtc(date).toISOString())
    .lte("sale_date", now.toISOString())
    .limit(5000);
  if (error) return undefined;
  const rows = (data ?? []) as Array<{ id: string; salesman?: string | null; net_amount?: number | null }>;
  if (!hideDc) return salesmanTotals(rows);
  const shares = await dcSharesBySale(db, rows.map((r) => r.id));
  return salesmanTotals(
    rows
      .map((r) => ({ ...r, net_amount: nonDcAmount(Number(r.net_amount) || 0, shares.get(r.id)) }))
      .filter((r) => !shares.has(r.id) || r.net_amount > 0),
  );
}

/** Screen a tapped cashier / day-end alert opens (the app's colour report for that IST day). */
function reportRoute(now: Date): string {
  return `/owner-alert/report?date=${istClock(now).date}`;
}

/** New customer reviews since the last runs, each sent once (owner_push_log kind "review"). */
async function sendNewReviews(db: Db, sa: ServiceAccount, org: string, now: Date, out: Record<string, unknown>[]) {
  const since = new Date(now.getTime() - REVIEW_LOOKBACK_MIN * 60_000).toISOString();
  const { data: reviews } = await db
    .from("customer_feedback")
    .select("id, sale_id, rating, comment, tags, source")
    .eq("organization_id", org)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(10);
  for (const r of reviews ?? []) {
    const logId = await claim(db, org, "review", r.id);
    if (!logId) continue;
    const { data: sale } = await db
      .from("sales")
      .select("sale_number, customer_name, customer_phone, salesman")
      .eq("organization_id", org)
      .eq("id", r.sale_id)
      .maybeSingle();
    const msg = reviewMessage({
      ...r,
      sale_number: sale?.sale_number,
      customer_name: sale?.customer_name,
      customer_phone: sale?.customer_phone,
      salesman: sale?.salesman,
    });
    out.push({ org, kind: "review", ...(await sendToOwners(db, sa, org, logId, msg, { route: "/customer-reviews" })) });
  }
}

async function runScheduled(db: Db, sa: ServiceAccount, now: Date) {
  const { data: rows } = await db.from("owner_alert_settings").select("*").eq("enabled", true);
  const out: Record<string, unknown>[] = [];
  for (const s of (rows ?? []) as Array<OwnerAlertSettings & { organization_id: string }>) {
    const org = s.organization_id;
    try {
      const hideDc = await hidesDc(db, org);
      const cashierKey = dueCashierSlot(s, now);
      if (cashierKey) {
        const logId = await claim(db, org, "cashier", cashierKey);
        if (logId) {
          const msg = cashierMessage(slotMinutes(cashierKey), await todayTotals(db, org, now, hideDc), await salesmenToday(db, s, org, now, hideDc));
          out.push({ org, kind: "cashier", ...(await sendToOwners(db, sa, org, logId, msg, { route: reportRoute(now) })) });
        }
      }
      const lowKey = dueLowStockSlot(s, now);
      if (lowKey) {
        const logId = await claim(db, org, "low_stock", lowKey);
        if (logId) {
          const { data: low } = await db.rpc("get_low_stock_alerts", { p_org_id: org, p_threshold: s.low_stock_threshold });
          const msg = lowStockMessage(low ?? []);
          if (msg) out.push({ org, kind: "low_stock", ...(await sendToOwners(db, sa, org, logId, msg, { route: "/stock-report?status=low" })) });
        }
      }
      const endKey = dueDayEndSlot(s, now);
      if (endKey) {
        const logId = await claim(db, org, "day_end", endKey);
        if (logId) {
          const msg = dayEndMessage(istClock(now).date, await todayTotals(db, org, now, hideDc), await salesmenToday(db, s, org, now, hideDc));
          out.push({ org, kind: "day_end", ...(await sendToOwners(db, sa, org, logId, msg, { route: reportRoute(now) })) });
        }
      }
      await sendNewReviews(db, sa, org, now, out);
    } catch (e) {
      console.error("owner-alerts org failed", org, e instanceof Error ? e.message : e);
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sa = parseServiceAccount(Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON"));
    if (!sa) return json(400, { error: "Push provider not configured" });
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const type = String(body?.type ?? "");

    if (type === "scheduled") {
      if (!(await isCronCall(req, body, db))) return json(401, { error: "Unauthorized" });
      return json(200, { ok: true, results: await runScheduled(db, sa, new Date()) });
    }

    const organizationId = String(body?.organizationId ?? "");
    if (!UUID.test(organizationId)) return json(400, { error: "Invalid organizationId" });
    const userId = await memberUserId(req, db, organizationId);
    if (!userId) return json(403, { error: "Forbidden" });

    const { data: settings } = await db.from("owner_alert_settings").select("*").eq("organization_id", organizationId).maybeSingle();

    if (type === "invoice") {
      const saleId = String(body?.saleId ?? "");
      if (!UUID.test(saleId)) return json(400, { error: "Invalid saleId" });
      if (!settings) return json(200, { ok: true, skipped: "not_configured" });
      const { data: sale } = await db
        .from("sales")
        .select("id, sale_number, net_amount, customer_name, payment_method")
        .eq("id", saleId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (!sale) return json(404, { error: "Sale not found" });
      let amount = Number(sale.net_amount);
      if (await hidesDc(db, organizationId)) {
        amount = nonDcAmount(amount, (await dcSharesBySale(db, [sale.id])).get(sale.id));
        if (amount <= 0) return json(200, { ok: true, skipped: "dc_bill" });
      }
      if (!shouldSendInvoiceAlert(settings, amount)) return json(200, { ok: true, skipped: "below_threshold" });
      const logId = await claim(db, organizationId, "invoice", sale.id);
      if (!logId) return json(200, { ok: true, skipped: "already_sent" });
      const r = await sendToOwners(db, sa, organizationId, logId, invoiceMessage({ ...sale, net_amount: amount }), { route: `/owner-alert/bill/${sale.id}`, sale_id: sale.id });
      return json(200, { ok: true, ...r });
    }

    if (type === "test") {
      const logId = await claim(db, organizationId, "test", `${userId}@${Date.now()}`);
      if (!logId) return json(500, { error: "Could not log test" });
      const r = await sendToOwners(
        db,
        sa,
        organizationId,
        logId,
        { title: "EzzyERP owner alerts are on", body: "You will get business reports, stock and bill alerts here." },
        { route: reportRoute(new Date()) },
      );
      return json(200, { ok: true, ...r });
    }

    return json(400, { error: "Unknown type" });
  } catch (e) {
    console.error("owner-alerts failed", e instanceof Error ? e.message : e);
    return json(500, { error: "Internal error" });
  }
});
