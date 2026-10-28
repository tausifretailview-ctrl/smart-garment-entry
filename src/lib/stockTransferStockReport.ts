import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface TransferInRow {
  to_variant_id: string | null;
  qty: number;
  stock_transfers: {
    transfer_number: string;
    from_organization_id: string;
    transfer_date: string;
    cancelled_at: string | null;
  } | null;
}

export interface TransferInInfo {
  qty: number;
  supplier_name: string;
  supplier_invoice_no: string;
}

/**
 * Stock Report: stock received from a sibling shop counts in Opening Qty, and the
 * sending shop shows as Supplier (latest transfer's shop + number). Pending
 * (to_variant_id NULL) and cancelled / rejected transfers are left out.
 */
export function summarizeTransferIn(
  rows: TransferInRow[],
  shopName: (orgId: string) => string,
): Map<string, TransferInInfo> {
  const out = new Map<string, TransferInInfo>();
  const latestAt = new Map<string, number>();
  for (const r of rows) {
    const t = r.stock_transfers;
    if (!r.to_variant_id || !t || t.cancelled_at) continue;
    const at = new Date(t.transfer_date).getTime() || 0;
    const prev = out.get(r.to_variant_id);
    const qty = (prev?.qty ?? 0) + (Number(r.qty) || 0);
    if (!prev || at >= (latestAt.get(r.to_variant_id) ?? 0)) {
      latestAt.set(r.to_variant_id, at);
      out.set(r.to_variant_id, {
        qty,
        supplier_name: shopName(t.from_organization_id),
        supplier_invoice_no: t.transfer_number,
      });
    } else {
      out.set(r.to_variant_id, { ...prev, qty });
    }
  }
  return out;
}

export interface TransferOutRow {
  from_variant_id: string | null;
  qty: number;
  stock_transfers: { cancelled_at: string | null } | null;
}

/** Qty sent out per variant: waiting + received transfers (stock already left this shop). */
export function summarizeTransferOut(rows: TransferOutRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.from_variant_id || !r.stock_transfers || r.stock_transfers.cancelled_at) continue;
    out.set(r.from_variant_id, (out.get(r.from_variant_id) ?? 0) + (Number(r.qty) || 0));
  }
  return out;
}

/** Never throws: the Stock Report still loads if transfers are not set up. */
export async function fetchTransferOutByVariantId(
  organizationId: string,
  variantIds: string[],
): Promise<Map<string, number>> {
  const ids = [...new Set(variantIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  try {
    const rows: TransferOutRow[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await db
        .from("stock_transfer_items")
        .select("from_variant_id, qty, stock_transfers!inner(cancelled_at, from_organization_id)")
        .in("from_variant_id", ids.slice(i, i + 100))
        .eq("stock_transfers.from_organization_id", organizationId);
      if (error) return new Map();
      rows.push(...((data || []) as TransferOutRow[]));
    }
    return summarizeTransferOut(rows);
  } catch {
    return new Map();
  }
}

/** Never throws: the Stock Report still loads if transfers are not set up. */
export async function fetchTransferInByVariantId(
  organizationId: string,
  variantIds: string[],
): Promise<Map<string, TransferInInfo>> {
  const ids = [...new Set(variantIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  try {
    const rows: TransferInRow[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await db
        .from("stock_transfer_items")
        .select("to_variant_id, qty, stock_transfers!inner(transfer_number, from_organization_id, transfer_date, cancelled_at, to_organization_id)")
        .in("to_variant_id", ids.slice(i, i + 100))
        .eq("stock_transfers.to_organization_id", organizationId);
      if (error) return new Map();
      rows.push(...((data || []) as TransferInRow[]));
    }
    if (rows.length === 0) return new Map();
    const { data: names } = await db.rpc("get_stock_transfer_shop_names", { p_organization_id: organizationId });
    const byId = new Map(((names || []) as Array<{ id: string; name: string }>).map((n) => [n.id, n.name]));
    return summarizeTransferIn(rows, (id) => byId.get(id) ?? "Other shop");
  } catch {
    return new Map();
  }
}
