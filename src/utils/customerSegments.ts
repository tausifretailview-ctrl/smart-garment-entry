import { supabase } from "@/integrations/supabase/client";

/** Same rules as main dashboard (Index.tsx) and get_customer_segment_* RPCs. */
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

const SEGMENT_VALUES: CustomerSegment[] = ["vip", "regular", "risk", "lost"];

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

/**
 * Client OFFSET walk over all sales — Phase B #4 hot path.
 * Kept only for equivalence proofs vs RPC; do not call from UI mounts.
 */
export async function fetchAllSalesForSegments(organizationId: string): Promise<SaleRow[]> {
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

function emptyCounts(total = 0): CustomerSegmentCounts {
  return { vip: 0, regular: 0, risk: 0, lost: 0, total };
}

function normalizeSegment(raw: string | null | undefined): CustomerSegment {
  const s = String(raw || "").toLowerCase();
  if (SEGMENT_VALUES.includes(s as CustomerSegment)) return s as CustomerSegment;
  return "regular";
}

function indexFromRows(
  rows: Array<{
    customer_id: string;
    segment: string;
    order_count: number | string | null;
    revenue: number | string | null;
    last_sale_date: string | null;
  }>,
): CustomerSegmentIndex {
  const segments: Record<string, CustomerSegment> = {};
  const stats: Record<string, CustomerSaleStats> = {};
  const counts = emptyCounts(rows.length);

  for (const row of rows) {
    const cid = row.customer_id;
    if (!cid) continue;
    const seg = normalizeSegment(row.segment);
    segments[cid] = seg;
    counts[seg] += 1;
    const last = row.last_sale_date ? String(row.last_sale_date).slice(0, 10) : null;
    stats[cid] = {
      orders: Number(row.order_count || 0),
      revenue: Number(row.revenue || 0),
      lastSaleDate: last,
    };
  }

  counts.total = Object.keys(segments).length;
  return { counts, segments, stats };
}

/**
 * Client-side index (full sales OFFSET walk). Use only for equivalence proofs /
 * emergency fallback — Customer Master mounts must use the RPC path.
 */
export async function fetchCustomerSegmentIndexClient(
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

/**
 * Diff client index vs counts RPC / index RPC for a real org (Phase B precondition).
 * Returns null when both sides agree.
 */
export function diffCustomerSegmentEquivalence(
  client: CustomerSegmentIndex,
  rpcCounts: CustomerSegmentCounts,
  rpcIndex?: CustomerSegmentIndex,
): {
  countsMatch: boolean;
  countDiff: Partial<Record<keyof CustomerSegmentCounts, { client: number; rpc: number }>>;
  segmentMismatchCount?: number;
  sampleMismatches?: Array<{ customerId: string; client: CustomerSegment; rpc: CustomerSegment }>;
} | null {
  const countDiff: Partial<
    Record<keyof CustomerSegmentCounts, { client: number; rpc: number }>
  > = {};
  let countsMatch = true;
  for (const key of ["vip", "regular", "risk", "lost", "total"] as const) {
    if (client.counts[key] !== rpcCounts[key]) {
      countsMatch = false;
      countDiff[key] = { client: client.counts[key], rpc: rpcCounts[key] };
    }
  }

  let segmentMismatchCount = 0;
  const sampleMismatches: Array<{
    customerId: string;
    client: CustomerSegment;
    rpc: CustomerSegment;
  }> = [];

  if (rpcIndex) {
    const ids = new Set([
      ...Object.keys(client.segments),
      ...Object.keys(rpcIndex.segments),
    ]);
    for (const id of ids) {
      const c = client.segments[id] ?? "regular";
      const r = rpcIndex.segments[id] ?? "regular";
      if (c !== r) {
        segmentMismatchCount += 1;
        if (sampleMismatches.length < 20) {
          sampleMismatches.push({ customerId: id, client: c, rpc: r });
        }
      }
    }
  }

  if (countsMatch && segmentMismatchCount === 0) return null;
  return {
    countsMatch,
    countDiff,
    ...(rpcIndex
      ? { segmentMismatchCount, sampleMismatches }
      : {}),
  };
}

/**
 * Build segment index for Customer Master filters/badges.
 *
 * Phase B #4: after a real-org equivalence proof passes (see
 * `docs/customer-segment-equivalence.md` + `scripts/prove-customer-segment-equivalence.mjs`),
 * flip this to prefer `fetchCustomerSegmentIndexViaRpc`. Until then the client walk
 * remains canonical so we do not silently prefer an unproven RPC.
 *
 * Chip counts already use `fetchCustomerSegmentCounts` (deployed RPC) and do not
 * block the customer list.
 */
export async function fetchCustomerSegmentIndex(
  organizationId: string,
): Promise<CustomerSegmentIndex> {
  return fetchCustomerSegmentIndexClient(organizationId);
}

/** RPC path — ready once migration is applied and equivalence proof passes. */
export async function fetchCustomerSegmentIndexViaRpc(
  organizationId: string,
): Promise<CustomerSegmentIndex> {
  const { data, error } = await supabase.rpc("get_customer_segment_index", {
    p_org_id: organizationId,
  });
  if (error) throw error;

  return indexFromRows(
    (data || []) as Array<{
      customer_id: string;
      segment: string;
      order_count: number | string | null;
      revenue: number | string | null;
      last_sale_date: string | null;
    }>,
  );
}

/**
 * Stats for one customer (Customer history / detail).
 *
 * TODO(phase-B#4): `get_customer_segment_counts` is counts-only and cannot replace
 * this. Keep the bounded per-customer walk for `useCustomerAccountHistoryData`
 * until a single-customer RPC exists.
 */
export async function fetchCustomerSaleStats(
  organizationId: string,
  customerId: string,
): Promise<CustomerSaleStats> {
  const statsMap: Record<string, CustomerSaleStats> = {
    [customerId]: { orders: 0, revenue: 0, lastSaleDate: null },
  };
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
      mergeSaleIntoStats(statsMap, row, ids);
    }

    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return statsMap[customerId];
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
