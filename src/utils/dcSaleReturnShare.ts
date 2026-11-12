/**
 * DC (No GST) sale returns, for the Sale Return Dashboard when DC is hidden.
 * sale_return_items.is_dc_item marks a returned DC line (set by the DC SQL of 24 Oct 2026).
 * A return whose every line is DC is left out; a mixed return keeps its row (credit notes and
 * refunds need the full amount) and only the summary tiles take its DC share out.
 * A lookup error hides nothing; it is logged to the console so it is not mistaken for a shop with no DC returns.
 */

type Line = { return_id: string; line_total?: number | null; is_dc_item?: boolean | null };

export type DcReturnSplit = {
  /** Returns whose every line is DC. */
  allDc: Set<string>;
  /** Mixed returns: DC part of the return, 0..1. */
  dcShare: Map<string, number>;
};

const EMPTY: DcReturnSplit = { allDc: new Set(), dcShare: new Map() };

function lookupFailed(error: unknown): DcReturnSplit {
  console.warn("[dcSaleReturnShare] DC return lookup failed; DC returns are shown", error);
  return EMPTY;
}
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
      if (error) return lookupFailed(error);
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
        if (error) return lookupFailed(error);
        lines.push(...((data || []) as Line[]));
        if (!data || data.length < PAGE) break;
      }
    }
    return splitDcReturns(lines);
  } catch (e) {
    return lookupFailed(e);
  }
}

/** Pure part of {@link fetchReturnsTiedToDcBills}: which returns point at a DC bill. */
export function returnsTiedToDcBills(
  returns: readonly { id: string; original_sale_number?: string | null; linked_sale_id?: string | null }[],
  dcBillIds: ReadonlySet<string>,
  dcBillNumbers: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>();
  for (const r of returns) {
    const original = String(r.original_sale_number || "").trim();
    if ((r.linked_sale_id && dcBillIds.has(r.linked_sale_id)) || (original && dcBillNumbers.has(original))) {
      out.add(r.id);
    }
  }
  return out;
}

/**
 * Returns tied to a DC bill, hidden with DC like the DC bill itself on the POS Dashboard:
 * the bill it came back from (original_sale_number) is a DC bill, or its credit was used on a
 * DC bill (linked_sale_id), e.g. SR/26-27/22 redeemed on DC/26-27/45. Only for Hide DC mode;
 * GST reports still read each return line by its own DC flag.
 * A lookup error hides nothing and is logged, like {@link fetchDcReturnSplit}.
 */
export async function fetchReturnsTiedToDcBills(
  supabaseClient: unknown,
  organizationId: string,
  fromDate?: string | null,
  toDate?: string | null,
): Promise<Set<string>> {
  const client = supabaseClient as Client;
  try {
    type Ret = { id: string; original_sale_number?: string | null; linked_sale_id?: string | null };
    const returns: Ret[] = [];
    for (let offset = 0; ; offset += PAGE) {
      let q = client
        .from("sale_returns")
        .select("id, original_sale_number, linked_sale_id")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .or("linked_sale_id.not.is.null,original_sale_number.not.is.null");
      if (fromDate) q = q.gte("return_date", fromDate);
      if (toDate) q = q.lte("return_date", toDate);
      const { data, error } = await q.order("id").range(offset, offset + PAGE - 1);
      if (error) return tiedLookupFailed(error);
      returns.push(...((data || []) as Ret[]));
      if (!data || data.length < PAGE) break;
    }
    if (returns.length === 0) return new Set();

    const linkedIds = [...new Set(returns.map((r) => r.linked_sale_id).filter((v): v is string => !!v))];
    const originalNumbers = [
      ...new Set(returns.map((r) => String(r.original_sale_number || "").trim()).filter(Boolean)),
    ];
    const dcBillIds = new Set<string>();
    const dcBillNumbers = new Set<string>();
    const lookUp = async (column: "id" | "sale_number", values: string[]) => {
      for (let i = 0; i < values.length; i += CHUNK) {
        const { data, error } = await client
          .from("sales")
          .select("id, sale_number")
          .eq("organization_id", organizationId)
          .eq("is_dc_bill", true)
          .in(column, values.slice(i, i + CHUNK));
        if (error) throw error;
        for (const s of (data || []) as Array<{ id: string; sale_number: string | null }>) {
          dcBillIds.add(s.id);
          if (s.sale_number) dcBillNumbers.add(s.sale_number);
        }
      }
    };
    await lookUp("id", linkedIds);
    await lookUp("sale_number", originalNumbers);
    return returnsTiedToDcBills(returns, dcBillIds, dcBillNumbers);
  } catch (e) {
    return tiedLookupFailed(e);
  }
}

function tiedLookupFailed(error: unknown): Set<string> {
  console.warn("[dcSaleReturnShare] DC bill lookup for returns failed; those returns are shown", error);
  return new Set();
}
