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
  cashierMessage,
  dayEndMessage,
  dueCashierSlot,
  dueDayEndSlot,
  dueLowStockSlot,
  invoiceMessage,
  istClock,
  istDayStartUtc,
  lowStockMessage,
  shouldSendInvoiceAlert,
  slotMinutes,
} from "../_shared/ownerAlertSchedule.ts";

// owner-alerts: phone notifications for shop owners (Android app, FCM).
//   { type: "scheduled" }              pg_cron every 15 min (one-time ticket) → cashier / low stock / day-end
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
  return { sent, failed };
}

async function todayTotals(db: Db, organizationId: string, now: Date): Promise<CashierTotals> {
  const { date } = istClock(now);
  const { data } = await db.rpc("get_pos_dashboard_stats", {
    p_organization_id: organizationId,
    p_date_from: istDayStartUtc(date).toISOString(),
    p_date_to: now.toISOString(),
    p_filters: {},
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

async function runScheduled(db: Db, sa: ServiceAccount, now: Date) {
  const { data: rows } = await db.from("owner_alert_settings").select("*").eq("enabled", true);
  const out: Record<string, unknown>[] = [];
  for (const s of (rows ?? []) as Array<OwnerAlertSettings & { organization_id: string }>) {
    const org = s.organization_id;
    try {
      const cashierKey = dueCashierSlot(s, now);
      if (cashierKey) {
        const logId = await claim(db, org, "cashier", cashierKey);
        if (logId) {
          const msg = cashierMessage(slotMinutes(cashierKey), await todayTotals(db, org, now));
          out.push({ org, kind: "cashier", ...(await sendToOwners(db, sa, org, logId, msg, { route: "/pos-dashboard" })) });
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
          const msg = dayEndMessage(istClock(now).date, await todayTotals(db, org, now));
          out.push({ org, kind: "day_end", ...(await sendToOwners(db, sa, org, logId, msg, { route: "/pos-dashboard" })) });
        }
      }
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
      if (!shouldSendInvoiceAlert(settings, Number(sale.net_amount))) return json(200, { ok: true, skipped: "below_threshold" });
      const logId = await claim(db, organizationId, "invoice", sale.id);
      if (!logId) return json(200, { ok: true, skipped: "already_sent" });
      const r = await sendToOwners(db, sa, organizationId, logId, invoiceMessage(sale), { route: "/pos-dashboard", sale_id: sale.id });
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
        { title: "EzzyERP owner alerts are on", body: "You will get cashier reports, stock and bill alerts here." },
        { route: "/pos-dashboard" },
      );
      return json(200, { ok: true, ...r });
    }

    return json(400, { error: "Unknown type" });
  } catch (e) {
    console.error("owner-alerts failed", e instanceof Error ? e.message : e);
    return json(500, { error: "Internal error" });
  }
});
