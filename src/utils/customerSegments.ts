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

const PAGE = 1000;

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

type SaleRow = {
  customer_id: string;
  sale_date: string | null;
  net_amount: number | null;
  payment_status: string | null;
  is_cancelled?: boolean | null;
};

function shouldSkipSale(row: SaleRow): boolean {
  if (row.is_cancelled === true) return true;
  const st = String(row.payment_status || "").toLowerCase();
  return st === "cancelled" || st === "hold";
}

function mergeSaleIntoStats(
  stats: Record<string, CustomerSaleStats>,
  row: SaleRow,
  customerIds: Set<string>,
) {
  if (shouldSkipSale(row)) return;
  const cid = row.customer_id;
  if (!customerIds.has(cid)) return;
  const sd = String(row.sale_date || "").slice(0, 10);
  if (!sd) return;

  const prev = stats[cid] || { orders: 0, revenue: 0, lastSaleDate: null };
  stats[cid] = {
    lastSaleDate: !prev.lastSaleDate || sd > prev.lastSaleDate ? sd : prev.lastSaleDate,
    orders: prev.orders + 1,
    revenue: prev.revenue + Number(row.net_amount || 0),
  };
}

/** Paginate all active customer ids (Supabase default limit is 1000 rows). */
async function fetchAllCustomerIds(organizationId: string): Promise<Set<string>> {
  const customerIds = new Set<string>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data as { id: string }[]) {
      customerIds.add(r.id);
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return customerIds;
}

/** Paginate all qualifying sales for segment aggregation. */
async function fetchAllSalesForSegments(organizationId: string): Promise<SaleRow[]> {
  const allRows: SaleRow[] = [];
  let offset = 0;
  let useCancelledColumn = true;

  for (;;) {
    const base = supabase
      .from("sales")
      .select(
        useCancelledColumn
          ? "customer_id, sale_date, net_amount, payment_status, is_cancelled"
          : "customer_id, sale_date, net_amount, payment_status",
      )
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .not("customer_id", "is", null)
      .order("sale_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);

    const { data, error } = await base;
    if (error && useCancelledColumn) {
      useCancelledColumn = false;
      offset = 0;
      allRows.length = 0;
      continue;
    }
    if (error) throw error;
    if (!data?.length) break;

    allRows.push(...((data as unknown) as SaleRow[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return allRows;
}

/** Build segment index from all customers + sales (for Customer Master filters). */
export async function fetchCustomerSegmentIndex(
  organizationId: string,
): Promise<CustomerSegmentIndex> {
  const customerIds = await fetchAllCustomerIds(organizationId);
  const salesRows = await fetchAllSalesForSegments(organizationId);

  const stats: Record<string, CustomerSaleStats> = {};
  for (const row of salesRows) {
    mergeSaleIntoStats(stats, row, customerIds);
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

/** Stats for one customer (Customer history / detail). */
export async function fetchCustomerSaleStats(
  organizationId: string,
  customerId: string,
): Promise<CustomerSaleStats> {
  const stats: CustomerSaleStats = { orders: 0, revenue: 0, lastSaleDate: null };
  const ids = new Set([customerId]);
  let offset = 0;
  let useCancelledColumn = true;

  for (;;) {
    const { data, error } = await supabase
      .from("sales")
      .select(
        useCancelledColumn
          ? "customer_id, sale_date, net_amount, payment_status, is_cancelled"
          : "customer_id, sale_date, net_amount, payment_status",
      )
      .eq("organization_id", organizationId)
      .eq("customer_id", customerId)
      .is("deleted_at", null)
      .order("sale_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error && useCancelledColumn) {
      useCancelledColumn = false;
      offset = 0;
      continue;
    }
    if (error) throw error;
    if (!data?.length) break;

    for (const row of (data as unknown) as SaleRow[]) {
      mergeSaleIntoStats({ [customerId]: stats }, row, ids);
    }

    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return stats;
}

export async function fetchCustomerSegmentCounts(
  organizationId: string,
): Promise<CustomerSegmentCounts> {
  const { data, error } = await supabase.rpc("get_customer_segment_counts", {
    p_org_id: organizationId,
  });
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        vip_count?: number | string | null;
        regular_count?: number | string | null;
        risk_count?: number | string | null;
        lost_count?: number | string | null;
      }
    | null
    | undefined;

  const vip = Number(row?.vip_count ?? 0);
  const regular = Number(row?.regular_count ?? 0);
  const risk = Number(row?.risk_count ?? 0);
  const lost = Number(row?.lost_count ?? 0);

  return {
    vip,
    regular,
    risk,
    lost,
    total: vip + regular + risk + lost,
  };
}
