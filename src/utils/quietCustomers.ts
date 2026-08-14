import { supabase } from "@/integrations/supabase/client";
import type { CustomerSegmentIndex } from "@/utils/customerSegments";

/** Same local calendar-day math as customerSegments.daysSince (not exported). */
export function daysSinceLastCompletedBill(ymd: string, now = new Date()): number {
  const t = new Date(`${ymd}T12:00:00`).getTime();
  return Math.floor((now.getTime() - t) / 86_400_000);
}

export type QuietCustomerRow = {
  customerId: string;
  orders: number;
  revenue: number;
  lastSaleDate: string;
  daysQuiet: number;
};

/**
 * Split named customers into dormant (had a bill, quiet ≥ N days) vs never purchased.
 * Never-purchased must stay out of the dormant list.
 */
export function splitQuietCustomers(
  index: CustomerSegmentIndex,
  quietDays: number,
  now = new Date(),
): { dormant: QuietCustomerRow[]; neverPurchasedIds: string[] } {
  const dormant: QuietCustomerRow[] = [];
  const neverPurchasedIds: string[] = [];
  const threshold = Math.max(1, Math.floor(quietDays));

  for (const customerId of Object.keys(index.segments)) {
    const stats = index.stats[customerId];
    const last = stats?.lastSaleDate ? String(stats.lastSaleDate).slice(0, 10) : null;
    if (!last) {
      neverPurchasedIds.push(customerId);
      continue;
    }
    const daysQuiet = daysSinceLastCompletedBill(last, now);
    if (daysQuiet >= threshold) {
      dormant.push({
        customerId,
        orders: Number(stats?.orders || 0),
        revenue: Number(stats?.revenue || 0),
        lastSaleDate: last,
        daysQuiet,
      });
    }
  }

  dormant.sort((a, b) => b.revenue - a.revenue || b.daysQuiet - a.daysQuiet);
  return { dormant, neverPurchasedIds };
}

export type WalkInBillShare = {
  walkInBills: number;
  namedBills: number;
  totalBills: number;
  walkInPct: number | null;
  windowDays: number;
};

/**
 * Own count for the named-customers caveat — segment index never sees null customer_id.
 * Uses completed-bill filters aligned with segment sales (soft-delete + cancel/hold).
 */
export async function fetchWalkInBillShare(
  organizationId: string,
  windowDays = 90,
): Promise<WalkInBillShare> {
  const since = new Date();
  since.setHours(12, 0, 0, 0);
  since.setDate(since.getDate() - Math.max(1, windowDays));
  const sinceYmd = since.toISOString().slice(0, 10);

  const base = () =>
    supabase
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .gte("sale_date", sinceYmd)
      .eq("is_cancelled", false);
  // payment_status hold/cancelled are also excluded in the segment walk; omitted
  // here so NULL payment_status bills are not dropped by NOT ILIKE semantics.

  const [walkIn, named] = await Promise.all([
    base().is("customer_id", null),
    base().not("customer_id", "is", null),
  ]);

  if (walkIn.error) throw walkIn.error;
  if (named.error) throw named.error;

  const walkInBills = walkIn.count ?? 0;
  const namedBills = named.count ?? 0;
  const totalBills = walkInBills + namedBills;

  return {
    walkInBills,
    namedBills,
    totalBills,
    walkInPct: totalBills > 0 ? (walkInBills / totalBills) * 100 : null,
    windowDays,
  };
}

export type QuietCustomerContact = {
  id: string;
  customer_name: string;
  phone: string | null;
};

const CONTACT_CHUNK = 100;

export async function fetchQuietCustomerContacts(
  organizationId: string,
  customerIds: string[],
): Promise<Map<string, QuietCustomerContact>> {
  const map = new Map<string, QuietCustomerContact>();
  const unique = [...new Set(customerIds.filter(Boolean))];
  if (!organizationId || unique.length === 0) return map;

  for (let i = 0; i < unique.length; i += CONTACT_CHUNK) {
    const chunk = unique.slice(i, i + CONTACT_CHUNK);
    const { data, error } = await supabase
      .from("customers")
      .select("id, customer_name, phone")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .in("id", chunk);
    if (error) throw error;
    for (const row of data || []) {
      map.set(row.id, {
        id: row.id,
        customer_name: row.customer_name || "—",
        phone: row.phone,
      });
    }
  }

  return map;
}
