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

const PAGE = 1000;

/**
 * Every transfer line of this shop on one side (a shop has far fewer transfer lines than
 * variants, so this is one or two requests however long the report is).
 */
async function fetchOrgTransferLines<T>(
  side: "to" | "from",
  organizationId: string,
  select: string,
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from("stock_transfer_items")
      .select(select)
      .eq(`stock_transfers.${side}_organization_id`, organizationId)
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (error) return null;
    rows.push(...((data || []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

function onlyIds<V>(map: Map<string, V>, variantIds: string[] | null): Map<string, V> {
  if (!variantIds) return map;
  const out = new Map<string, V>();
  for (const id of variantIds) {
    const v = map.get(id);
    if (v !== undefined) out.set(id, v);
  }
  return out;
}

/**
 * Never throws: the reports still load if transfers are not set up.
 * `variantIds` null = every variant of the shop.
 */
export async function fetchTransferOutByVariantId(
  organizationId: string,
  variantIds: string[] | null,
): Promise<Map<string, number>> {
  if (variantIds && variantIds.length === 0) return new Map();
  try {
    const rows = await fetchOrgTransferLines<TransferOutRow>(
      "from",
      organizationId,
      "from_variant_id, qty, stock_transfers!inner(cancelled_at, from_organization_id)",
    );
    return rows ? onlyIds(summarizeTransferOut(rows), variantIds) : new Map();
  } catch {
    return new Map();
  }
}

/** Never throws: the reports still load if transfers are not set up. */
export async function fetchTransferInByVariantId(
  organizationId: string,
  variantIds: string[] | null,
): Promise<Map<string, TransferInInfo>> {
  if (variantIds && variantIds.length === 0) return new Map();
  try {
    const rows = await fetchOrgTransferLines<TransferInRow>(
      "to",
      organizationId,
      "to_variant_id, qty, stock_transfers!inner(transfer_number, from_organization_id, transfer_date, cancelled_at, to_organization_id)",
    );
    if (!rows || rows.length === 0) return new Map();
    const { data: names } = await db.rpc("get_stock_transfer_shop_names", { p_organization_id: organizationId });
    const byId = new Map(((names || []) as Array<{ id: string; name: string }>).map((n) => [n.id, n.name]));
    return onlyIds(summarizeTransferIn(rows, (id) => byId.get(id) ?? "Other shop"), variantIds);
  } catch {
    return new Map();
  }
}

/**
 * get_stock_report rows with stock moved between the owner's shops folded in, so
 * Opening + Purchase − Sales ... still adds up to Current Stock: stock received counts
 * in Opening Qty; stock sent out is returned as transfer_out_qty (only fetched when the
 * shop shows the Transfer Out column).
 */
export async function withStockTransferQty<T extends { variant_id: string; opening_qty: number | null }>(
  organizationId: string,
  rows: T[],
  opts: { transferOut: boolean },
): Promise<Array<T & { transfer_out_qty: number }>> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.variant_id);
  const [inMap, outMap] = await Promise.all([
    fetchTransferInByVariantId(organizationId, ids),
    opts.transferOut ? fetchTransferOutByVariantId(organizationId, ids) : Promise.resolve(new Map<string, number>()),
  ]);
  return rows.map((r) => ({
    ...r,
    opening_qty: (Number(r.opening_qty) || 0) + (inMap.get(r.variant_id)?.qty ?? 0),
    transfer_out_qty: outMap.get(r.variant_id) ?? 0,
  }));
}

export interface TransferValueRow {
  qty: number;
  unit_cost: number | null;
  line_value: number | null;
  to_variant_id?: string | null;
  stock_transfers: {
    transfer_date: string;
    accepted_at?: string | null;
    cancelled_at: string | null;
  } | null;
}

/** One live transfer line at cost, dated the day the stock moved (local yyyy-MM-dd). */
export interface TransferValueLine {
  day: string;
  value: number;
}

const localDay = (ts: string) => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Cost of stock that left (side "out", on the send date) or reached (side "in", on the
 * accept date) this shop. Cancelled / rejected transfers and lines still waiting to be
 * received (no to_variant_id) are left out, same as Stock Reconciliation.
 */
export function transferValueLines(rows: TransferValueRow[], side: "in" | "out"): TransferValueLine[] {
  const out: TransferValueLine[] = [];
  for (const r of rows) {
    const t = r.stock_transfers;
    if (!t || t.cancelled_at) continue;
    if (side === "in" && !r.to_variant_id) continue;
    const at = side === "in" ? t.accepted_at || t.transfer_date : t.transfer_date;
    const value = Number(r.line_value) || (Number(r.qty) || 0) * (Number(r.unit_cost) || 0);
    out.push({ day: localDay(at), value });
  }
  return out;
}

/** Sum of lines dated after `afterDay` (exclusive) and up to `uptoDay` (inclusive); null = open end. */
export function sumTransferValue(lines: TransferValueLine[], afterDay: string | null, uptoDay: string | null): number {
  let sum = 0;
  for (const l of lines) {
    if (afterDay && l.day <= afterDay) continue;
    if (uptoDay && l.day > uptoDay) continue;
    sum += l.value;
  }
  return Math.round(sum * 100) / 100;
}

/** Never throws: P&L still loads (without transfers) if transfers are not set up. */
export async function fetchTransferValueLines(
  organizationId: string,
): Promise<{ in: TransferValueLine[]; out: TransferValueLine[] }> {
  try {
    const [inRows, outRows] = await Promise.all([
      fetchOrgTransferLines<TransferValueRow>(
        "to",
        organizationId,
        "qty, unit_cost, line_value, to_variant_id, stock_transfers!inner(transfer_date, accepted_at, cancelled_at, to_organization_id)",
      ),
      fetchOrgTransferLines<TransferValueRow>(
        "from",
        organizationId,
        "qty, unit_cost, line_value, stock_transfers!inner(transfer_date, cancelled_at, from_organization_id)",
      ),
    ]);
    return {
      in: transferValueLines(inRows ?? [], "in"),
      out: transferValueLines(outRows ?? [], "out"),
    };
  } catch {
    return { in: [], out: [] };
  }
}
