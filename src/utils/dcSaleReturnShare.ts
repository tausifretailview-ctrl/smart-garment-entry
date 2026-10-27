/**
 * DC (No GST) sale returns, for the Sale Return Dashboard when DC is hidden.
 * sale_return_items.is_dc_item marks a returned DC line (set by the DC SQL of 24 Oct 2026).
 * A return whose every line is DC is left out; a mixed return keeps its row (credit notes and
 * refunds need the full amount) and only the summary tiles take its DC share out.
 * A lookup error hides nothing.
 */

type Line = { return_id: string; line_total?: number | null; is_dc_item?: boolean | null };

export type DcReturnSplit = {
  /** Returns whose every line is DC. */
  allDc: Set<string>;
  /** Mixed returns: DC part of the return, 0..1. */
  dcShare: Map<string, number>;
};

const EMPTY: DcReturnSplit = { allDc: new Set(), dcShare: new Map() };
const PAGE = 1000;
const CHUNK = 200;

type Client = { from: (table: string) => any };

/** Lines of returns that have at least one DC line (each line with its is_dc_item flag). */
export function splitDcReturns(lines: readonly Line[]): DcReturnSplit {
  const net = new Map<string, { dc: number; all: number; gstLines: number }>();
  for (const l of lines) {
    const cur = net.get(l.return_id) ?? { dc: 0, all: 0, gstLines: 0 };
    const amount = Number(l.line_total) || 0;
    cur.all += amount;
    if (l.is_dc_item === true) cur.dc += amount;
    else cur.gstLines += 1;
    net.set(l.return_id, cur);
  }
  const out: DcReturnSplit = { allDc: new Set(), dcShare: new Map() };
  for (const [id, n] of net) {
    if (n.gstLines === 0) out.allDc.add(id);
    else if (n.all > 0 && n.dc > 0) out.dcShare.set(id, Math.min(1, n.dc / n.all));
  }
  return out;
}

/** DC returns of the organisation, optionally within return dates (yyyy-MM-dd). */
export async function fetchDcReturnSplit(
  supabaseClient: unknown,
  organizationId: string,
  fromDate?: string | null,
  toDate?: string | null,
): Promise<DcReturnSplit> {
  const client = supabaseClient as Client;
  try {
    const dcIds = new Set<string>();
    for (let offset = 0; ; offset += PAGE) {
      let q = client
        .from("sale_return_items")
        .select("return_id, sale_returns!inner(organization_id, return_date, deleted_at)")
        .eq("is_dc_item", true)
        .is("deleted_at", null)
        .eq("sale_returns.organization_id", organizationId)
        .is("sale_returns.deleted_at", null);
      if (fromDate) q = q.gte("sale_returns.return_date", fromDate);
      if (toDate) q = q.lte("sale_returns.return_date", toDate);
      const { data, error } = await q.range(offset, offset + PAGE - 1);
      if (error) return EMPTY;
      for (const r of (data || []) as Line[]) dcIds.add(r.return_id);
      if (!data || data.length < PAGE) break;
    }
    if (dcIds.size === 0) return EMPTY;
    const ids = [...dcIds];
    const lines: Line[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      // Page: 200 returns can hold more than the 1,000 rows one request returns.
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await client
          .from("sale_return_items")
          .select("return_id, line_total, is_dc_item")
          .in("return_id", ids.slice(i, i + CHUNK))
          .is("deleted_at", null)
          .order("id")
          .range(offset, offset + PAGE - 1);
        if (error) return EMPTY;
        lines.push(...((data || []) as Line[]));
        if (!data || data.length < PAGE) break;
      }
    }
    return splitDcReturns(lines);
  } catch {
    return EMPTY;
  }
}

/** PostgREST "not in" list for the all-DC returns, or null when there are none. */
export function dcReturnNotInList(split: DcReturnSplit): string | null {
  return split.allDc.size > 0 ? `(${[...split.allDc].join(",")})` : null;
}
