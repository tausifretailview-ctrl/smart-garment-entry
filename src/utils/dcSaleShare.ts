/**
 * DC (No GST) part of a mixed sale bill, for totals that leave DC out
 * (Settings > Purchase "Hide DC", or Ctrl+Shift+H).
 *
 * Bills whose every line is DC carry sales.is_dc_bill and are filtered out by the query.
 * A mixed bill keeps only its non-DC share: share = non-DC lines / all lines, both after the
 * bill discount and round-off (sale_items.net_after_discount). Prints never use this.
 */

export type DcLineShare = { dcNet: number; allNet: number; dcQty: number };

/** Money columns on a sales row that scale with the non-DC share. */
export const DC_SCALED_SALE_MONEY_FIELDS = [
  "gross_amount",
  "discount_amount",
  "flat_discount_amount",
  "points_redeemed_amount",
  "net_amount",
  "paid_amount",
  "cash_amount",
  "card_amount",
  "upi_amount",
  "refund_amount",
  "credit_note_amount",
  "sale_return_adjust",
  "round_off",
] as const;

/** Part of the bill that stays visible (0 … 1). No DC lines → 1. */
export function nonDcShare(share: DcLineShare | null | undefined): number {
  if (!share || share.dcNet <= 0 || share.allNet <= 0) return 1;
  return Math.min(1, Math.max(0, (share.allNet - share.dcNet) / share.allNet));
}

/** Copy of a sales row with the DC part taken out of its money columns and total_qty. */
export function saleRowWithoutDc<T extends Record<string, unknown>>(
  row: T,
  share: DcLineShare | null | undefined,
): T {
  const r = nonDcShare(share);
  if (r === 1 && !(share && share.dcQty > 0)) return row;
  const out: Record<string, unknown> = { ...row };
  for (const field of DC_SCALED_SALE_MONEY_FIELDS) {
    const v = row[field];
    if (v == null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) out[field] = Math.round(n * r * 100) / 100;
  }
  if (row.total_qty != null && share) {
    out.total_qty = Math.max(0, (Number(row.total_qty) || 0) - share.dcQty);
  }
  return out as T;
}

type LineRow = {
  sale_id: string;
  net_after_discount?: number | string | null;
  line_total?: number | string | null;
  quantity?: number | string | null;
};

const lineNet = (l: LineRow) => Number(l.net_after_discount ?? l.line_total ?? 0) || 0;

/** Build per-bill DC shares from the DC lines and all lines of the bills that have DC lines. */
export function buildDcLineShares(dcLines: readonly LineRow[], allLines: readonly LineRow[]): Map<string, DcLineShare> {
  const out = new Map<string, DcLineShare>();
  for (const l of dcLines) {
    const id = String(l.sale_id);
    const cur = out.get(id) || { dcNet: 0, allNet: 0, dcQty: 0 };
    cur.dcNet += lineNet(l);
    cur.dcQty += Number(l.quantity) || 0;
    out.set(id, cur);
  }
  for (const l of allLines) {
    const cur = out.get(String(l.sale_id));
    if (cur) cur.allNet += lineNet(l);
  }
  return out;
}

type SaleItemsClient = {
  from: (table: string) => any;
};

const CHUNK = 200;

/** DC shares for these bills (two small queries; the DC one uses the partial DC-line index). */
export async function fetchDcLineShares(
  supabaseClient: unknown,
  saleIds: readonly string[],
): Promise<Map<string, DcLineShare>> {
  const client = supabaseClient as SaleItemsClient;
  const ids = [...new Set(saleIds.filter(Boolean))];
  const dcLines: LineRow[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await client
      .from("sale_items")
      .select("sale_id, net_after_discount, line_total, quantity")
      .in("sale_id", ids.slice(i, i + CHUNK))
      .eq("is_dc_item", true)
      .is("deleted_at", null);
    if (error) throw error;
    dcLines.push(...((data || []) as LineRow[]));
  }
  const dcSaleIds = [...new Set(dcLines.map((l) => String(l.sale_id)))];
  const allLines: LineRow[] = [];
  for (let i = 0; i < dcSaleIds.length; i += CHUNK) {
    const { data, error } = await client
      .from("sale_items")
      .select("sale_id, net_after_discount, line_total")
      .in("sale_id", dcSaleIds.slice(i, i + CHUNK))
      .is("deleted_at", null);
    if (error) throw error;
    allLines.push(...((data || []) as LineRow[]));
  }
  return buildDcLineShares(dcLines, allLines);
}

/**
 * Sales rows for a DC-hidden total: DC part of mixed bills taken out, bills left with
 * nothing visible (every line DC but not yet flagged) dropped.
 */
export async function saleRowsWithoutDc<T extends { id: string }>(
  client: unknown,
  rows: readonly T[],
): Promise<T[]> {
  if (rows.length === 0) return [];
  const shares = await fetchDcLineShares(
    client,
    rows.map((r) => r.id),
  );
  const out: T[] = [];
  for (const row of rows) {
    const share = shares.get(String(row.id));
    if (share && nonDcShare(share) === 0) continue;
    out.push(saleRowWithoutDc(row as T & Record<string, unknown>, share));
  }
  return out;
}
