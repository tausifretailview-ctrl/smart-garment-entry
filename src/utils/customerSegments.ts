import { supabase } from "@/integrations/supabase/client";

/** Same rules as main dashboard (Index.tsx). */
export const CUSTOMER_SEGMENT_RULES = {
  vipRecencyDays: 90,
  riskRecencyDays: 365,
  vipMinOrders: 5,
  vipMinRevenue: 50_000,
} as const;

export type CustomerSegment = "vip" | "regular" | "risk" | "lost";

export type CustomerSegmentCounts = {
  vip: number;
  regular: number;
  risk: number;
  lost: number;
  total: number;
};

export type CustomerSaleStats = {
  orders: number;
  revenue: number;
  lastSaleDate: string | null;
};

export type CustomerSegmentIndex = {
  counts: CustomerSegmentCounts;
  segments: Record<string, CustomerSegment>;
  stats: Record<string, CustomerSaleStats>;
};

function daysSince(ymd: string): number {
  const now = new Date();
  const t = new Date(ymd + "T12:00:00").getTime();
  return Math.floor((now.getTime() - t) / 86400000);
}

export function classifyCustomerSegment(
  stats: CustomerSaleStats | undefined,
  rules = CUSTOMER_SEGMENT_RULES,
): CustomerSegment {
  if (!stats?.lastSaleDate) return "regular";

  const d = daysSince(stats.lastSaleDate);
  if (d > rules.riskRecencyDays) return "lost";
  if (d > rules.vipRecencyDays) return "risk";
  if (stats.orders >= rules.vipMinOrders || stats.revenue >= rules.vipMinRevenue) {
    return "vip";
  }
  return "regular";
}

export const CUSTOMER_SEGMENT_LABELS: Record<CustomerSegment, string> = {
  vip: "VIP",
  regular: "Regular",
  risk: "At risk",
  lost: "Lost",
};

export const CUSTOMER_SEGMENT_HINTS: Record<CustomerSegment | "all", string> = {
  all: "All active customers",
  vip: "Last sale within 90 days and (5+ orders or ₹50,000+ lifetime)",
  regular: "Active recently below VIP, or no sales yet",
  risk: "Last sale 91–365 days ago",
  lost: "No sale in over 365 days",
};

/** Build segment index from all customers + sales (for Customer Master filters). */
export async function fetchCustomerSegmentIndex(
  organizationId: string,
): Promise<CustomerSegmentIndex> {
  const { data: custRows, error: cErr } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (cErr) throw cErr;

  const customerIds = new Set((custRows || []).map((r: { id: string }) => r.id));
  const stats: Record<string, CustomerSaleStats> = {};
  const PAGE = 1000;
  let from = 0;

  for (;;) {
    const { data: rows, error } = await supabase
      .from("sales")
      .select("customer_id, sale_date, net_amount, payment_status, is_cancelled")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .not("customer_id", "is", null)
      .order("sale_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!rows?.length) break;

    for (const row of rows as {
      customer_id: string;
      sale_date: string | null;
      net_amount: number | null;
      payment_status: string | null;
      is_cancelled?: boolean | null;
    }[]) {
      if (row.is_cancelled) continue;
      const st = String(row.payment_status || "").toLowerCase();
      if (st === "cancelled" || st === "hold") continue;
      const cid = row.customer_id;
      if (!customerIds.has(cid)) continue;
      const sd = String(row.sale_date || "").slice(0, 10);
      if (!sd) continue;

      const prev = stats[cid] || { orders: 0, revenue: 0, lastSaleDate: null };
      stats[cid] = {
        lastSaleDate: !prev.lastSaleDate || sd > prev.lastSaleDate ? sd : prev.lastSaleDate,
        orders: prev.orders + 1,
        revenue: prev.revenue + Number(row.net_amount || 0),
      };
    }

    if (rows.length < PAGE) break;
    from += PAGE;
  }

  const segments: Record<string, CustomerSegment> = {};
  const counts: CustomerSegmentCounts = {
    vip: 0,
    regular: 0,
    risk: 0,
    lost: 0,
    total: customerIds.size,
  };

  for (const cid of customerIds) {
    const seg = classifyCustomerSegment(stats[cid]);
    segments[cid] = seg;
    counts[seg] += 1;
  }

  return { counts, segments, stats };
}

export async function fetchCustomerSegmentCounts(
  organizationId: string,
): Promise<CustomerSegmentCounts> {
  const { counts } = await fetchCustomerSegmentIndex(organizationId);
  return counts;
}
