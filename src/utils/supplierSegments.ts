import { supabase } from "@/integrations/supabase/client";

/** Mirrors customer segment rules; applied to purchase bills. */
export const SUPPLIER_SEGMENT_RULES = {
  vipRecencyDays: 90,
  riskRecencyDays: 365,
  vipMinBills: 5,
  vipMinPurchase: 50_000,
} as const;

export type SupplierSegment = "vip" | "regular" | "risk" | "lost";

export type SupplierSegmentCounts = {
  vip: number;
  regular: number;
  risk: number;
  lost: number;
  total: number;
};

export type SupplierPurchaseStats = {
  bills: number;
  purchaseTotal: number;
  lastPurchaseDate: string | null;
};

export type SupplierSegmentIndex = {
  counts: SupplierSegmentCounts;
  segments: Record<string, SupplierSegment>;
  stats: Record<string, SupplierPurchaseStats>;
};

const PAGE = 1000;

function daysSince(ymd: string): number {
  const now = new Date();
  const t = new Date(ymd + "T12:00:00").getTime();
  return Math.floor((now.getTime() - t) / 86400000);
}

export function classifySupplierSegment(
  stats: SupplierPurchaseStats | undefined,
  rules = SUPPLIER_SEGMENT_RULES,
): SupplierSegment {
  if (!stats?.lastPurchaseDate) return "regular";

  const d = daysSince(stats.lastPurchaseDate);
  if (d > rules.riskRecencyDays) return "lost";
  if (d > rules.vipRecencyDays) return "risk";
  if (stats.bills >= rules.vipMinBills || stats.purchaseTotal >= rules.vipMinPurchase) {
    return "vip";
  }
  return "regular";
}

export const SUPPLIER_SEGMENT_LABELS: Record<SupplierSegment, string> = {
  vip: "VIP",
  regular: "Regular",
  risk: "At risk",
  lost: "Lost",
};

export const SUPPLIER_SEGMENT_HINTS: Record<SupplierSegment | "all", string> = {
  all: "All active suppliers",
  vip: "Last purchase within 90 days and (5+ bills or ₹50,000+ lifetime)",
  regular: "Active recently below VIP, or no purchases yet",
  risk: "Last purchase 91–365 days ago",
  lost: "No purchase in over 365 days",
};

type PurchaseBillRow = {
  supplier_id: string;
  bill_date: string | null;
  net_amount: number | null;
  payment_status: string | null;
  is_cancelled?: boolean | null;
};

function shouldSkipBill(row: PurchaseBillRow): boolean {
  if (row.is_cancelled === true) return true;
  const st = String(row.payment_status || "").toLowerCase();
  return st === "cancelled" || st === "hold";
}

function mergeBillIntoStats(
  stats: Record<string, SupplierPurchaseStats>,
  row: PurchaseBillRow,
  supplierIds: Set<string>,
) {
  if (shouldSkipBill(row)) return;
  const sid = row.supplier_id;
  if (!sid || !supplierIds.has(sid)) return;
  const bd = String(row.bill_date || "").slice(0, 10);
  if (!bd) return;

  const prev = stats[sid] || { bills: 0, purchaseTotal: 0, lastPurchaseDate: null };
  stats[sid] = {
    lastPurchaseDate:
      !prev.lastPurchaseDate || bd > prev.lastPurchaseDate ? bd : prev.lastPurchaseDate,
    bills: prev.bills + 1,
    purchaseTotal: prev.purchaseTotal + Number(row.net_amount || 0),
  };
}

async function fetchAllSupplierIds(organizationId: string): Promise<Set<string>> {
  const supplierIds = new Set<string>();
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("suppliers")
      .select("id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data as { id: string }[]) {
      supplierIds.add(r.id);
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return supplierIds;
}

async function fetchAllPurchaseBillsForSegments(organizationId: string): Promise<PurchaseBillRow[]> {
  const allRows: PurchaseBillRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("purchase_bills")
      .select("supplier_id, bill_date, net_amount, payment_status, is_cancelled")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .not("supplier_id", "is", null)
      .order("bill_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) throw error;
    if (!data?.length) break;

    allRows.push(...((data as unknown) as PurchaseBillRow[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return allRows;
}

export async function fetchSupplierSegmentIndex(
  organizationId: string,
): Promise<SupplierSegmentIndex> {
  const supplierIds = await fetchAllSupplierIds(organizationId);
  const billRows = await fetchAllPurchaseBillsForSegments(organizationId);

  const stats: Record<string, SupplierPurchaseStats> = {};
  for (const row of billRows) {
    mergeBillIntoStats(stats, row, supplierIds);
  }

  const segments: Record<string, SupplierSegment> = {};
  const counts: SupplierSegmentCounts = {
    vip: 0,
    regular: 0,
    risk: 0,
    lost: 0,
    total: supplierIds.size,
  };

  for (const sid of supplierIds) {
    const seg = classifySupplierSegment(stats[sid]);
    segments[sid] = seg;
    counts[seg] += 1;
  }

  return { counts, segments, stats };
}

export async function fetchSupplierSegmentCounts(
  organizationId: string,
): Promise<SupplierSegmentCounts> {
  const { counts } = await fetchSupplierSegmentIndex(organizationId);
  return counts;
}
