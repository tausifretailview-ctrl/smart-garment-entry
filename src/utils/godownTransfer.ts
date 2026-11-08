import { supabase } from "@/integrations/supabase/client";
import { ymdToDdMmYyyy } from "@/lib/dateDisplay";
import { formatGodownQty, godownErrorText, godownItemLabel, type Godown } from "@/utils/godowns";

/**
 * Industrial mode, Phase 3 step 3b: move stock from one godown to another (GT/yy-yy/n) and print
 * the delivery challan that travels with the goods. Shop stock does not change; only the split
 * between godowns does, through godown_move_stock / godown_cancel_move (step 3a SQL).
 */

export type GodownTransferItem = {
  variant_id: string;
  product_name: string;
  brand: string | null;
  size: string | null;
  color: string | null;
  barcode: string | null;
  uom: string | null;
  /** Purchase rate, for the value on the challan. */
  rate: number;
};

export type GodownTransferLine = GodownTransferItem & { qty: number };

/** Stock of each item in each godown: variant id → godown id → qty (Main worked out by the SQL). */
export type GodownQtyMap = Record<string, Record<string, number>>;

export const roundQty = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;

/** Fresh godown quantities for the asked items replace what was known about them. */
export function mergeGodownQty(
  map: GodownQtyMap,
  askedIds: string[],
  rows: { variant_id: string; godown_id: string; qty: number | string }[],
): GodownQtyMap {
  const next: GodownQtyMap = { ...map };
  for (const id of askedIds) next[id] = {};
  for (const r of rows) {
    const v = String(r.variant_id);
    next[v] = { ...(next[v] ?? {}), [String(r.godown_id)]: roundQty(Number(r.qty)) };
  }
  return next;
}

export function qtyInGodown(map: GodownQtyMap, variantId: string, godownId: string | null | undefined): number {
  if (!godownId) return 0;
  return map[variantId]?.[godownId] ?? 0;
}

export type AddTransferLineResult = { ok: true; lines: GodownTransferLine[] } | { ok: false; lines: GodownTransferLine[]; reason: string };

/**
 * Add one scan or pick. A new line starts at 1 (or all there is, when less than 1 is left);
 * a repeat scan raises it by 1, up to what the godown holds. The newest line goes on top.
 */
export function addTransferLine(
  lines: GodownTransferLine[],
  item: GodownTransferItem,
  available: number,
  fromName: string,
): AddTransferLineResult {
  const label = godownItemLabel(item);
  const avail = roundQty(available);
  if (avail <= 0) return { ok: false, lines, reason: `No ${label} in ${fromName}` };
  const existing = lines.find((l) => l.variant_id === item.variant_id);
  if (existing) {
    if (existing.qty >= avail) {
      return { ok: false, lines, reason: `Only ${formatGodownQty(avail)} of ${label} is in ${fromName}` };
    }
    const qty = roundQty(Math.min(existing.qty + 1, avail));
    return { ok: true, lines: [{ ...existing, qty }, ...lines.filter((l) => l.variant_id !== item.variant_id)] };
  }
  return { ok: true, lines: [{ ...item, qty: roundQty(Math.min(1, avail)) }, ...lines] };
}

export function setTransferLineQty(lines: GodownTransferLine[], variantId: string, qty: number): GodownTransferLine[] {
  const clean = roundQty(Math.max(0, Number(qty) || 0));
  return lines.map((l) => (l.variant_id === variantId ? { ...l, qty: clean } : l));
}

/** What stops each line from being saved, by variant id (same checks as the SQL). */
export function transferLineProblems(
  lines: GodownTransferLine[],
  map: GodownQtyMap,
  fromId: string | null,
  fromName: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of lines) {
    const avail = qtyInGodown(map, l.variant_id, fromId);
    if (!(l.qty > 0)) out[l.variant_id] = "Enter a quantity above 0";
    else if (l.qty > avail) out[l.variant_id] = `Only ${formatGodownQty(Math.max(avail, 0))} in ${fromName}`;
  }
  return out;
}

export function transferTotals(lines: Pick<GodownTransferLine, "qty" | "rate">[]) {
  let qty = 0;
  let value = 0;
  for (const l of lines) {
    qty += Number(l.qty) || 0;
    value += (Number(l.qty) || 0) * (Number(l.rate) || 0);
  }
  return { items: lines.length, qty: roundQty(qty), value: Math.round(value * 100) / 100 };
}

export type GodownTransport = {
  vehicle_no?: string;
  transporter_name?: string;
  lr_no?: string;
};

/** "mh 04 ab-1234" → "MH04AB1234", as the e-way bill portal wants it. */
export function normalizeVehicleNo(v: string): string {
  return String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Transport details as saved on the transfer; null when nothing was typed. */
export function cleanTransport(t: GodownTransport): GodownTransport | null {
  const out: GodownTransport = {};
  const vehicle = normalizeVehicleNo(t.vehicle_no ?? "");
  if (vehicle) out.vehicle_no = vehicle;
  const transporter = String(t.transporter_name ?? "").trim();
  if (transporter) out.transporter_name = transporter.slice(0, 100);
  const lr = String(t.lr_no ?? "").trim();
  if (lr) out.lr_no = lr.slice(0, 30);
  return Object.keys(out).length ? out : null;
}

export function transportOf(raw: unknown): GodownTransport {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : undefined);
  return { vehicle_no: s("vehicle_no"), transporter_name: s("transporter_name"), lr_no: s("lr_no") };
}

/* ------------------------------------------------------------------ */
/* Transfer list                                                        */
/* ------------------------------------------------------------------ */

export type GodownMoveRow = {
  id: string;
  move_no: string | null;
  move_date: string;
  from_godown_id: string;
  to_godown_id: string;
  ref_type: string;
  ref_no: string | null;
  note: string | null;
  transport: unknown;
  total_qty: number;
  total_value: number;
  status: "done" | "cancelled";
  created_at: string;
  cancelled_at: string | null;
  item_count: number;
};

/** Only hand-made transfers can be cancelled here; moves made by a bill follow that bill. */
export function canCancelMove(m: Pick<GodownMoveRow, "status" | "ref_type">): boolean {
  return m.status === "done" && (m.ref_type === "transfer" || m.ref_type === "opening");
}

export type GodownTransferFilters = {
  organizationId: string;
  range: { from: string; to: string } | null;
  godownId: string | null;
  status: "all" | "done" | "cancelled";
  search: string;
};

export const GODOWN_TRANSFER_PAGE = 50;

/** Search text safe inside a PostgREST or() filter. */
export function transferSearchTerm(s: string): string {
  return String(s ?? "").replace(/[%,()*\\]/g, " ").trim().slice(0, 40);
}

/** One or() filter for the godown and the search (PostgREST ANDs them inside). */
export function transferOrFilter(godownId: string | null, search: string): string | null {
  const parts: string[] = [];
  if (godownId) parts.push(`or(from_godown_id.eq.${godownId},to_godown_id.eq.${godownId})`);
  const term = transferSearchTerm(search);
  if (term) parts.push(`or(move_no.ilike.%${term}%,note.ilike.%${term}%)`);
  if (!parts.length) return null;
  return `and(${parts.join(",")})`;
}

// The godown tables (Phase 3 SQL) are not in the generated DB types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (): any => supabase;

const MOVE_COLS =
  "id, move_no, move_date, from_godown_id, to_godown_id, ref_type, ref_no, note, transport, total_qty, total_value, status, created_at, cancelled_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filtered(query: any, f: GodownTransferFilters) {
  let q = query.eq("organization_id", f.organizationId).in("ref_type", ["transfer", "opening"]);
  if (f.range) q = q.gte("move_date", f.range.from).lte("move_date", f.range.to);
  if (f.status !== "all") q = q.eq("status", f.status);
  const or = transferOrFilter(f.godownId, f.search);
  if (or) q = q.or(or);
  return q;
}

export async function fetchGodownTransfers(f: GodownTransferFilters, page: number): Promise<{ rows: GodownMoveRow[]; total: number }> {
  const from = page * GODOWN_TRANSFER_PAGE;
  const { data, error, count } = await filtered(db().from("godown_moves").select(MOVE_COLS, { count: "exact" }), f)
    .order("move_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + GODOWN_TRANSFER_PAGE - 1);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moves = (data ?? []) as any[];
  // Item lines per transfer, counted from one small read of this page's lines.
  const lineCount = new Map<string, number>();
  if (moves.length) {
    const { data: lines, error: lineErr } = await db()
      .from("godown_move_items")
      .select("move_id")
      .in("move_id", moves.map((m) => m.id))
      .limit(20000);
    if (lineErr) throw lineErr;
    for (const l of (lines ?? []) as { move_id: string }[]) lineCount.set(l.move_id, (lineCount.get(l.move_id) ?? 0) + 1);
  }
  const rows = moves.map((r) => ({
    ...r,
    total_qty: Number(r.total_qty) || 0,
    total_value: Number(r.total_value) || 0,
    item_count: lineCount.get(r.id) ?? 0,
  })) as GodownMoveRow[];
  return { rows, total: count ?? rows.length };
}

/** Totals of the transfers that went through, for the cards above the list. */
export async function fetchGodownTransferStats(f: GodownTransferFilters): Promise<{ count: number; qty: number; value: number }> {
  const { data, error } = await filtered(db().from("godown_moves").select("total_qty, total_value"), { ...f, status: "done" }).limit(10000);
  if (error) throw error;
  let qty = 0;
  let value = 0;
  for (const r of (data ?? []) as { total_qty: number; total_value: number }[]) {
    qty += Number(r.total_qty) || 0;
    value += Number(r.total_value) || 0;
  }
  return { count: (data ?? []).length, qty: roundQty(qty), value: Math.round(value) };
}

export type GodownMoveItemRow = {
  variant_id: string;
  qty: number;
  rate: number;
  value: number;
  product_name: string;
  size: string | null;
  color: string | null;
  barcode: string | null;
  hsn_code: string | null;
  uom: string | null;
};

export async function fetchGodownMoveItems(moveId: string): Promise<GodownMoveItemRow[]> {
  const { data, error } = await db()
    .from("godown_move_items")
    .select("variant_id, qty, rate, value, product_variants:variant_id (size, color, barcode, products:product_id (product_name, hsn_code, uom))")
    .eq("move_id", moveId);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[])
    .map((r) => ({
      variant_id: String(r.variant_id),
      qty: Number(r.qty) || 0,
      rate: Number(r.rate) || 0,
      value: Number(r.value) || 0,
      product_name: String(r.product_variants?.products?.product_name ?? "Item"),
      size: r.product_variants?.size ?? null,
      color: r.product_variants?.color ?? null,
      barcode: r.product_variants?.barcode ?? null,
      hsn_code: r.product_variants?.products?.hsn_code ?? null,
      uom: r.product_variants?.products?.uom ?? null,
    }))
    .sort((a, b) => godownItemLabel(a).localeCompare(godownItemLabel(b)));
}

export async function fetchGodownMove(moveId: string): Promise<Omit<GodownMoveRow, "item_count">> {
  const { data, error } = await db().from("godown_moves").select(MOVE_COLS).eq("id", moveId).single();
  if (error) throw error;
  return { ...data, total_qty: Number(data.total_qty) || 0, total_value: Number(data.total_value) || 0 };
}

/** Godown quantities of the given items (every godown, Main worked out). */
export async function fetchVariantGodownQty(organizationId: string, variantIds: string[]) {
  if (!variantIds.length) return [] as { variant_id: string; godown_id: string; qty: number }[];
  const { data, error } = await db().rpc("get_variant_godown_qty", { p_organization_id: organizationId, p_variant_ids: variantIds });
  if (error) throw new Error(godownErrorText(error));
  return (data ?? []) as { variant_id: string; godown_id: string; qty: number }[];
}

export async function saveGodownTransfer(input: {
  organizationId: string;
  fromId: string;
  toId: string;
  date: string;
  lines: GodownTransferLine[];
  note: string;
  transport: GodownTransport;
}): Promise<{ id: string; move_no: string; total_qty: number; total_value: number }> {
  const { data, error } = await db().rpc("godown_move_stock", {
    p_organization_id: input.organizationId,
    p_from_godown_id: input.fromId,
    p_to_godown_id: input.toId,
    p_move_date: input.date,
    p_lines: input.lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty, rate: l.rate })),
    p_ref_type: "transfer",
    p_ref_id: null,
    p_ref_no: null,
    p_note: input.note.trim() || null,
    p_transport: cleanTransport(input.transport),
  });
  if (error) throw new Error(godownErrorText(error));
  return {
    id: String(data?.id ?? ""),
    move_no: String(data?.move_no ?? ""),
    total_qty: Number(data?.total_qty) || 0,
    total_value: Number(data?.total_value) || 0,
  };
}

export async function cancelGodownTransfer(moveId: string): Promise<void> {
  const { error } = await db().rpc("godown_cancel_move", { p_move_id: moveId });
  if (error) throw new Error(godownErrorText(error));
}

/* ------------------------------------------------------------------ */
/* Delivery challan print                                               */
/* ------------------------------------------------------------------ */

export const CHALLAN_COPIES = ["Original for consignee", "Duplicate for transporter", "Triplicate for consignor"] as const;

export type GodownChallanData = {
  shop: { name: string; address: string; gstin: string; phone: string };
  move: Pick<GodownMoveRow, "move_no" | "move_date" | "note" | "status" | "transport">;
  from: Pick<Godown, "name" | "address" | "pincode" | "contact_name" | "contact_phone" | "godown_type">;
  to: Pick<Godown, "name" | "address" | "pincode" | "contact_name" | "contact_phone" | "godown_type">;
  items: GodownMoveItemRow[];
  copies: string[];
};

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (n: number) => (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function placeHtml(title: string, g: GodownChallanData["from"], gstin: string): string {
  const contact = [g.contact_name, g.contact_phone].filter(Boolean).join(", ");
  return `<div class="box"><div class="lbl">${esc(title)}</div>
<div class="nm">${esc(g.name)}</div>
<div>${esc([g.address, g.pincode].filter(Boolean).join(" ")) || "&nbsp;"}</div>
${contact ? `<div class="mut">${esc(contact)}</div>` : ""}
${gstin ? `<div class="mut">GSTIN ${esc(gstin)}</div>` : ""}</div>`;
}

/** A4 delivery challan for goods moved between the shop's own godowns (Rule 55, not a sale). */
export function buildGodownChallanHtml(d: GodownChallanData): string {
  const t = transportOf(d.move.transport);
  const totalQty = roundQty(d.items.reduce((s, i) => s + i.qty, 0));
  const totalValue = d.items.reduce((s, i) => s + i.value, 0);
  const units = new Set(d.items.map((i) => (i.uom || "").toUpperCase()).filter(Boolean));
  const unitText = units.size === 1 ? ` ${esc([...units][0])}` : "";
  const rows = d.items
    .map(
      (i, n) => `<tr><td class="c">${n + 1}</td><td>${esc(godownItemLabel(i))}${i.barcode ? `<div class="mut">${esc(i.barcode)}</div>` : ""}</td>
<td class="c">${esc(i.hsn_code || "")}</td><td class="r">${esc(formatGodownQty(i.qty))}</td><td class="c">${esc(i.uom || "")}</td>
<td class="r">${money(i.rate)}</td><td class="r">${money(i.value)}</td></tr>`,
    )
    .join("");
  const cancelled = d.move.status === "cancelled";
  const copies = d.copies.length ? d.copies : [CHALLAN_COPIES[0]];
  const page = (copy: string) => `<section class="page">
${cancelled ? `<div class="stamp">CANCELLED</div>` : ""}
<div class="head"><div><div class="shop">${esc(d.shop.name)}</div>
<div>${esc(d.shop.address)}</div>
<div class="mut">${[d.shop.gstin ? `GSTIN ${esc(d.shop.gstin)}` : "", d.shop.phone ? `Ph ${esc(d.shop.phone)}` : ""].filter(Boolean).join(" · ")}</div></div>
<div class="copy">${esc(copy)}</div></div>
<div class="title">DELIVERY CHALLAN<span>Godown transfer · not a sale</span></div>
<div class="grid4">
<div class="box"><div class="lbl">Challan no</div><div class="nm">${esc(d.move.move_no || "")}</div></div>
<div class="box"><div class="lbl">Date</div><div class="nm">${esc(ymdToDdMmYyyy(d.move.move_date))}</div></div>
<div class="box"><div class="lbl">Vehicle no</div><div class="nm">${esc(t.vehicle_no || "—")}</div></div>
<div class="box"><div class="lbl">Transporter / LR no</div><div>${esc([t.transporter_name, t.lr_no].filter(Boolean).join(" · ") || "—")}</div></div>
</div>
<div class="grid2">${placeHtml("From (consignor)", d.from, d.shop.gstin)}${placeHtml("To (consignee)", d.to, d.shop.gstin)}</div>
<table><thead><tr><th class="c">#</th><th>Item</th><th class="c">HSN</th><th class="r">Qty</th><th class="c">Unit</th><th class="r">Rate</th><th class="r">Value</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="3">Total (${d.items.length} item${d.items.length === 1 ? "" : "s"})</td><td class="r">${esc(formatGodownQty(totalQty))}${unitText}</td><td></td><td></td><td class="r">${money(totalValue)}</td></tr></tfoot></table>
${d.move.note ? `<p><b>Note:</b> ${esc(d.move.note)}</p>` : ""}
<p class="decl">Goods moved from one godown to another of the same business${d.shop.gstin ? ` (GSTIN ${esc(d.shop.gstin)})` : ""}. This is not a supply and no tax is charged. Value shown at purchase rate. Delivery challan under Rule 55 of the CGST Rules, 2017.</p>
<div class="sign"><div>Received by (sign &amp; stamp)</div><div>For ${esc(d.shop.name)}<br><br>Authorised signatory</div></div>
</section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.move.move_no || "Godown transfer")}</title>
<style>
@page{size:A4;margin:10mm}
*{box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;margin:0}
.page{position:relative;page-break-after:always;padding:2mm}
.page:last-child{page-break-after:auto}
.head{display:flex;justify-content:space-between;gap:12px;border-bottom:2px solid #0f766e;padding-bottom:6px}
.shop{font-size:18px;font-weight:bold;color:#0f766e}
.copy{font-size:10px;font-weight:bold;text-transform:uppercase;border:1px solid #0f766e;color:#0f766e;padding:3px 8px;height:fit-content;white-space:nowrap}
.title{text-align:center;font-size:16px;font-weight:bold;letter-spacing:1px;margin:8px 0}
.title span{display:block;font-size:10px;font-weight:normal;letter-spacing:0;color:#555}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:6px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px}
.box{border:1px solid #bbb;padding:5px 7px}
.lbl{font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.5px}
.nm{font-weight:bold;font-size:13px}
.mut{color:#555;font-size:11px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#f0fdfa;font-size:11px}
.r{text-align:right}.c{text-align:center}
tfoot td{font-weight:bold;background:#f8fafc}
.decl{font-size:10px;color:#444;margin-top:10px}
.sign{display:flex;justify-content:space-between;margin-top:40px}
.sign div:last-child{text-align:right}
.stamp{position:absolute;top:40%;left:20%;font-size:72px;font-weight:bold;color:rgba(185,28,28,.18);transform:rotate(-20deg)}
</style></head><body>${copies.map(page).join("")}</body></html>`;
}
