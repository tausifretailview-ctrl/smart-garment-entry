import { format } from "date-fns";

/**
 * Delivery Dashboard tiles, status pie and 7-day trend.
 * Built by get_delivery_dashboard_summary in one request; summarizeDeliveryRows is the
 * same sum done in the browser, used only until that database update is applied.
 * Both count live bills only: not deleted, not cancelled, not held.
 */

export type DeliveryTrendDay = { day: string; delivered: number; pending: number; in_process: number };

export type DeliverySummary = {
  total: number;
  delivered: number;
  pending: number;
  inProcess: number;
  deliveredValue: number;
  pendingValue: number;
  trend: DeliveryTrendDay[];
};

type SummaryRpc = {
  total?: number;
  delivered?: number;
  pending?: number;
  in_process?: number;
  delivered_value?: number;
  pending_value?: number;
  trend?: Array<{ day?: string; delivered?: number; pending?: number; in_process?: number }>;
};

const n = (v: unknown) => Number(v) || 0;

export function deliverySummaryFromRpc(raw: unknown): DeliverySummary {
  const r = (raw && typeof raw === "object" ? raw : {}) as SummaryRpc;
  return {
    total: n(r.total),
    delivered: n(r.delivered),
    pending: n(r.pending),
    inProcess: n(r.in_process),
    deliveredValue: n(r.delivered_value),
    pendingValue: n(r.pending_value),
    trend: (Array.isArray(r.trend) ? r.trend : []).map((d) => ({
      day: String(d.day || ""),
      delivered: n(d.delivered),
      pending: n(d.pending),
      in_process: n(d.in_process),
    })),
  };
}

export type DeliveryRow = {
  delivery_status: string | null;
  net_amount: number | string | null;
  sale_date: string;
};

/** IST calendar day (yyyy-MM-dd) of a timestamp, matching the database function. */
export function istDay(iso: string | Date): string {
  const t = new Date(iso).getTime() + 330 * 60_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Browser-side fallback: same counts from rows already filtered to live bills. */
export function summarizeDeliveryRows(rows: DeliveryRow[], days = 7, now: Date = new Date()): DeliverySummary {
  const today = istDay(now);
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    dayKeys.push(istDay(new Date(new Date(`${today}T12:00:00+05:30`).getTime() - i * 86_400_000)));
  }
  const byDay = new Map(dayKeys.map((d) => [d, { day: d, delivered: 0, pending: 0, in_process: 0 }]));
  const s: DeliverySummary = { total: 0, delivered: 0, pending: 0, inProcess: 0, deliveredValue: 0, pendingValue: 0, trend: [] };
  for (const row of rows) {
    s.total += 1;
    const amount = n(row.net_amount);
    const bucket = byDay.get(istDay(row.sale_date));
    if (row.delivery_status === "delivered") {
      s.delivered += 1;
      s.deliveredValue += amount;
      if (bucket) bucket.delivered += 1;
    } else if (row.delivery_status === "undelivered") {
      s.pending += 1;
      s.pendingValue += amount;
      if (bucket) bucket.pending += 1;
    } else if (row.delivery_status === "in_process") {
      s.inProcess += 1;
      if (bucket) bucket.in_process += 1;
    }
  }
  s.trend = dayKeys.map((d) => byDay.get(d)!);
  return s;
}

/** Chart rows for AnimatedChart: "Nov 12" labels, as before. */
export function deliveryTrendChart(trend: DeliveryTrendDay[]) {
  return trend.map((d) => ({
    name: format(new Date(`${d.day}T12:00:00+05:30`), "MMM dd"),
    delivered: d.delivered,
    pending: d.pending,
    inProcess: d.in_process,
  }));
}

export function deliveryStatusPie(s: Pick<DeliverySummary, "delivered" | "pending" | "inProcess">) {
  return [
    { name: "Delivered", value: s.delivered },
    { name: "Pending", value: s.pending },
    { name: "In Process", value: s.inProcess },
  ];
}

/** Columns the invoice list, status dialog, WhatsApp and Excel export read. */
export const DELIVERY_LIST_COLUMNS =
  "id, sale_number, sale_date, customer_id, customer_name, customer_phone, customer_address, net_amount, paid_amount, payment_status, delivery_status";
