/** Customer notifications page: summary numbers and "not enabled" list. Pure, for tests. */

export interface PushMessageRow {
  id: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  dismissed_at: string | null;
  error_code: string | null;
  sale_id: string | null;
  campaign_id: string | null;
  subscription_id: string;
}

export interface PushSubscriptionRow {
  id: string;
  customer_phone_last10: string;
  customer_id: string | null;
  status: string;
  receives_invoices: boolean;
  confirmed_at: string | null;
  created_at: string;
  last_seen_at: string | null;
  inactive_reason: string | null;
}

export interface PushSummary {
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  failed: number;
  queued: number;
  /** opened / sent, 0–100 */
  openRate: number;
}

export type PushStatusFilter = "all" | "sent" | "delivered" | "opened" | "failed" | "queued";

/** Display status: the furthest step a message reached. */
export function pushMessageStage(m: Pick<PushMessageRow, "status" | "delivered_at" | "opened_at">): Exclude<PushStatusFilter, "all"> {
  if (m.status === "failed") return "failed";
  if (m.opened_at) return "opened";
  if (m.delivered_at) return "delivered";
  if (m.status === "sent") return "sent";
  return "queued";
}

export function summarizePushMessages(rows: Pick<PushMessageRow, "status" | "delivered_at" | "opened_at">[]): PushSummary {
  let sent = 0;
  let delivered = 0;
  let opened = 0;
  let failed = 0;
  let queued = 0;
  for (const m of rows) {
    const stage = pushMessageStage(m);
    if (stage === "failed") failed += 1;
    else if (stage === "queued") queued += 1;
    else {
      // Sent counts every message that left the server; delivered/opened are subsets.
      sent += 1;
      if (stage === "delivered" || stage === "opened") delivered += 1;
      if (stage === "opened") opened += 1;
    }
  }
  return {
    total: rows.length,
    sent,
    delivered,
    opened,
    failed,
    queued,
    openRate: sent ? Math.round((opened / sent) * 100) : 0,
  };
}

export function matchesPushStatus(m: Pick<PushMessageRow, "status" | "delivered_at" | "opened_at">, filter: PushStatusFilter): boolean {
  if (filter === "all") return true;
  const stage = pushMessageStage(m);
  if (filter === "sent") return stage === "sent" || stage === "delivered" || stage === "opened";
  if (filter === "delivered") return stage === "delivered" || stage === "opened";
  return stage === filter;
}

export function phoneLast10(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

/** A phone gets bill notifications only with a confirmed, invoice-receiving subscription. */
export function enabledPhones(subs: Pick<PushSubscriptionRow, "customer_phone_last10" | "status" | "receives_invoices">[]): Set<string> {
  const out = new Set<string>();
  for (const s of subs) {
    if (s.status === "confirmed" && s.receives_invoices) {
      const p = phoneLast10(s.customer_phone_last10);
      if (p) out.add(p);
    }
  }
  return out;
}

export interface SaleForInvite {
  id: string;
  sale_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  sale_date: string;
  net_amount?: number | null;
}

export interface NotEnabledCustomer {
  phone: string;
  customer_name: string;
  bills: number;
  lastSaleId: string;
  lastSaleNumber: string;
  lastSaleDate: string;
}

/**
 * Customers with a bill in the period whose phone has no working subscription.
 * One row per phone (latest bill kept for the invite link), most bills first.
 */
export function customersNotEnabled(sales: SaleForInvite[], enabled: Set<string>): NotEnabledCustomer[] {
  const byPhone = new Map<string, NotEnabledCustomer>();
  for (const s of sales) {
    const phone = phoneLast10(s.customer_phone);
    if (!phone || enabled.has(phone)) continue;
    const prev = byPhone.get(phone);
    if (!prev) {
      byPhone.set(phone, {
        phone,
        customer_name: (s.customer_name ?? "").trim(),
        bills: 1,
        lastSaleId: s.id,
        lastSaleNumber: s.sale_number ?? "",
        lastSaleDate: s.sale_date,
      });
      continue;
    }
    prev.bills += 1;
    if (s.sale_date > prev.lastSaleDate) {
      prev.lastSaleId = s.id;
      prev.lastSaleNumber = s.sale_number ?? "";
      prev.lastSaleDate = s.sale_date;
      if ((s.customer_name ?? "").trim()) prev.customer_name = (s.customer_name ?? "").trim();
    }
    if (!prev.customer_name && (s.customer_name ?? "").trim()) prev.customer_name = (s.customer_name ?? "").trim();
  }
  return [...byPhone.values()].sort((a, b) => b.bills - a.bills || (a.lastSaleDate < b.lastSaleDate ? 1 : -1));
}

/** Short reason for a failed push, from push-send's error_code. */
export function pushFailureLabel(code: string | null | undefined): string {
  const c = (code ?? "").toUpperCase();
  if (!c) return "";
  if (c.includes("UNREGISTERED") || c.includes("NOT_FOUND")) return "Phone turned notifications off / app data cleared";
  if (c.includes("INVALID_ARGUMENT")) return "Invalid notification token";
  if (c.includes("SENDER_ID_MISMATCH")) return "Token from another Firebase project";
  if (c.includes("QUOTA") || c.includes("UNAVAILABLE") || c.includes("INTERNAL")) return "Firebase busy, try later";
  if (c.includes("OAUTH") || c.includes("PERMISSION_DENIED") || c.includes("UNAUTHENTICATED")) return "Firebase key problem";
  return code ?? "";
}

export function buildPushInviteMessage(opts: { customerName: string; shopName: string; url: string }): string {
  const hi = opts.customerName ? `Hi ${opts.customerName},` : "Hi,";
  return [
    hi,
    `Get your bills and offers from ${opts.shopName} as phone notifications.`,
    `Open your bill and tap "Turn on notifications":`,
    opts.url,
  ].join("\n");
}
