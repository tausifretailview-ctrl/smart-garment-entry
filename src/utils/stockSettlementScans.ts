import { supabase } from "@/integrations/supabase/client";

export const settlementSessionStorageKey = (orgId: string) =>
  `stock-settlement-session-v1-${orgId}`;

export interface StockSettlementScanRow {
  id: string;
  organization_id: string;
  settlement_session_id: string;
  variant_id: string;
  barcode: string | null;
  counted_qty: number;
  system_qty: number;
  scanned_by: string | null;
  scanned_at: string;
  settled: boolean;
  created_at: string | null;
}

export interface OpenSettlementScanInfo {
  variant_id: string;
  barcode: string | null;
  counted_qty: number;
  system_qty: number;
  scanned_at: string;
  scanned_by: string | null;
  settlement_session_id: string;
}

export async function fetchLatestOpenSessionId(orgId: string): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from("stock_settlement_scans")
    .select("settlement_session_id, scanned_at")
    .eq("organization_id", orgId)
    .eq("settled", false)
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("fetchLatestOpenSessionId:", error);
    return null;
  }
  return data?.settlement_session_id ?? null;
}

export async function fetchOpenScansForSession(
  orgId: string,
  sessionId: string,
): Promise<StockSettlementScanRow[]> {
  const { data, error } = await (supabase as any)
    .from("stock_settlement_scans")
    .select("*")
    .eq("organization_id", orgId)
    .eq("settlement_session_id", sessionId)
    .eq("settled", false);

  if (error) {
    console.error("fetchOpenScansForSession:", error);
    return [];
  }
  return (data || []) as StockSettlementScanRow[];
}

export async function fetchOpenScansByVariantIds(
  orgId: string,
  variantIds: string[],
): Promise<Map<string, OpenSettlementScanInfo>> {
  const uniqueIds = [...new Set(variantIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await (supabase as any)
    .from("stock_settlement_scans")
    .select(
      "variant_id, barcode, counted_qty, system_qty, scanned_at, scanned_by, settlement_session_id",
    )
    .eq("organization_id", orgId)
    .eq("settled", false)
    .in("variant_id", uniqueIds);

  if (error) {
    console.error("fetchOpenScansByVariantIds:", error);
    return new Map();
  }

  const map = new Map<string, OpenSettlementScanInfo>();
  for (const row of data || []) {
    const existing = map.get(row.variant_id);
    if (!existing || new Date(row.scanned_at) > new Date(existing.scanned_at)) {
      map.set(row.variant_id, row as OpenSettlementScanInfo);
    }
  }
  return map;
}

export async function fetchAllOpenSettlementVariantIds(orgId: string): Promise<Set<string>> {
  const { data, error } = await (supabase as any)
    .from("stock_settlement_scans")
    .select("variant_id")
    .eq("organization_id", orgId)
    .eq("settled", false);

  if (error) {
    console.error("fetchAllOpenSettlementVariantIds:", error);
    return new Set();
  }
  return new Set((data || []).map((r: { variant_id: string }) => r.variant_id));
}

export async function fetchSettlementScanLog(
  orgId: string,
  limit = 500,
): Promise<StockSettlementScanRow[]> {
  const { data, error } = await (supabase as any)
    .from("stock_settlement_scans")
    .select("*")
    .eq("organization_id", orgId)
    .order("scanned_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("fetchSettlementScanLog:", error);
    return [];
  }
  return (data || []) as StockSettlementScanRow[];
}

export async function upsertSettlementScan(params: {
  organizationId: string;
  sessionId: string;
  variantId: string;
  barcode?: string | null;
  countedQty: number;
  systemQty: number;
  scannedBy: string;
}): Promise<void> {
  const { error } = await (supabase as any)
    .from("stock_settlement_scans")
    .upsert(
      {
        organization_id: params.organizationId,
        settlement_session_id: params.sessionId,
        variant_id: params.variantId,
        barcode: params.barcode ?? null,
        counted_qty: params.countedQty,
        system_qty: params.systemQty,
        scanned_by: params.scannedBy,
        scanned_at: new Date().toISOString(),
        settled: false,
      },
      { onConflict: "settlement_session_id,variant_id" },
    );

  if (error) throw error;
}

/** Delete a single OPEN (unsettled) scan for a variant in a session. */
export async function deleteSettlementScan(params: {
  organizationId: string;
  sessionId: string;
  variantId: string;
}): Promise<void> {
  const { error } = await (supabase as any)
    .from("stock_settlement_scans")
    .delete()
    .eq("organization_id", params.organizationId)
    .eq("settlement_session_id", params.sessionId)
    .eq("variant_id", params.variantId)
    .eq("settled", false);

  if (error) throw error;
}

/** Delete ALL open (unsettled) scans for a session — used by "Clear All Scans". */
export async function deleteAllOpenScansForSession(params: {
  organizationId: string;
  sessionId: string;
}): Promise<void> {
  const { error } = await (supabase as any)
    .from("stock_settlement_scans")
    .delete()
    .eq("organization_id", params.organizationId)
    .eq("settlement_session_id", params.sessionId)
    .eq("settled", false);

  if (error) throw error;
}

export async function settleStockSession(
  organizationId: string,
  sessionId: string,
  note?: string,
): Promise<{ settled_count: number; session_id: string }> {
  const { data, error } = await (supabase as any).rpc("settle_stock_session", {
    p_organization_id: organizationId,
    p_session_id: sessionId,
    p_note: note?.trim() || null,
  });

  if (error) throw error;
  return data as { settled_count: number; session_id: string };
}

export function resolveScannerLabel(
  scannedBy: string | null,
  currentUserId: string | undefined,
  currentUserEmail: string | undefined,
): string {
  if (!scannedBy) return "Unknown";
  if (currentUserId && scannedBy === currentUserId) {
    return currentUserEmail || "You";
  }
  return "Staff";
}
