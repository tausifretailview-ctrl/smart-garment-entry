/** Stock transfer between sibling shops (same owner, separate organizations). */

/** Settings > Sale: "Stock Transfer" switch (sale_settings.stock_transfer_enabled), off until turned on. */
export function isStockTransferEnabled(saleSettings: unknown): boolean {
  return (saleSettings as { stock_transfer_enabled?: boolean } | null | undefined)?.stock_transfer_enabled === true;
}

export interface TransferScanVariant {
  id: string;
  barcode: string | null;
  size: string | null;
  color: string | null;
  stock_qty: number;
  pur_price: number | null;
  sale_price: number | null;
  product_name: string;
  brand: string | null;
}

export interface TransferLine extends TransferScanVariant {
  qty: number;
}

export type AddScanResult =
  | { ok: true; lines: TransferLine[] }
  | { ok: false; lines: TransferLine[]; reason: string };

/** Add one scan: repeat scans of the same variant raise its qty (never above stock). */
export function addScanToLines(
  lines: TransferLine[],
  variant: TransferScanVariant,
  qty = 1,
): AddScanResult {
  const stock = Number(variant.stock_qty) || 0;
  const existing = lines.find((l) => l.id === variant.id);
  const nextQty = (existing?.qty ?? 0) + qty;
  if (nextQty > stock) {
    return {
      ok: false,
      lines,
      reason: `Only ${stock} in stock for ${variant.product_name}${variant.size ? ` (${variant.size})` : ""}`,
    };
  }
  if (existing) {
    return {
      ok: true,
      lines: [{ ...existing, qty: nextQty }, ...lines.filter((l) => l.id !== variant.id)],
    };
  }
  return { ok: true, lines: [{ ...variant, qty: nextQty }, ...lines] };
}

/** Set a line's qty from the qty box; clamps to 1..stock. */
export function setLineQty(lines: TransferLine[], variantId: string, qty: number): TransferLine[] {
  return lines.map((l) => {
    if (l.id !== variantId) return l;
    const stock = Number(l.stock_qty) || 0;
    const clean = Math.floor(Number(qty) || 0);
    return { ...l, qty: Math.max(1, Math.min(stock, clean)) };
  });
}

export function transferTotals(lines: Array<{ qty: number; pur_price: number | null }>) {
  let qty = 0;
  let value = 0;
  for (const l of lines) {
    qty += Number(l.qty) || 0;
    value += (Number(l.qty) || 0) * (Number(l.pur_price) || 0);
  }
  return { qty, value: Math.round(value * 100) / 100 };
}

export interface TransferNoteItem {
  product_name: string | null;
  barcode: string | null;
  size: string | null;
  color: string | null;
  qty: number;
  unit_cost: number;
  line_value: number;
}

export interface TransferNoteData {
  transfer_number: string;
  transfer_date: string;
  from_name: string;
  to_name: string;
  notes: string | null;
  cancelled: boolean;
  /** e.g. "REJECTED" or "WAITING TO BE RECEIVED"; overrides the CANCELLED line. */
  status_text?: string | null;
  items: TransferNoteItem[];
}

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (n: number) =>
  (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A4 transfer note (delivery slip that travels with the goods). */
export function buildTransferNoteHtml(d: TransferNoteData): string {
  const totalQty = d.items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const totalValue = d.items.reduce((s, i) => s + (Number(i.line_value) || 0), 0);
  const date = new Date(d.transfer_date);
  const dateText = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const rows = d.items
    .map(
      (i, idx) => `<tr>
<td>${idx + 1}</td><td>${esc(i.product_name)}</td><td>${esc(i.barcode)}</td>
<td>${esc(i.size)}</td><td>${esc(i.color)}</td>
<td class="r">${esc(i.qty)}</td><td class="r">${money(i.unit_cost)}</td><td class="r">${money(i.line_value)}</td>
</tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.transfer_number)}</title>
<style>
@page{size:A4;margin:12mm}
body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111}
h1{font-size:18px;margin:0 0 4px}
.meta{display:flex;justify-content:space-between;margin:8px 0 12px;gap:16px}
.box{border:1px solid #999;padding:6px 8px;flex:1}
.box b{display:block;font-size:10px;color:#555;text-transform:uppercase}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #999;padding:4px 6px;text-align:left}
th{background:#eee;font-size:11px}
.r{text-align:right}
tfoot td{font-weight:bold}
.cancel{color:#b00;font-weight:bold;font-size:14px;margin:6px 0}
.sign{display:flex;justify-content:space-between;margin-top:48px}
</style></head><body>
<h1>Stock Transfer Note</h1>
${d.status_text ? `<div class="cancel">${esc(d.status_text)}</div>` : d.cancelled ? `<div class="cancel">CANCELLED</div>` : ""}
<div class="meta">
<div class="box"><b>Transfer No</b>${esc(d.transfer_number)}</div>
<div class="box"><b>Date</b>${esc(dateText)}</div>
<div class="box"><b>From shop</b>${esc(d.from_name)}</div>
<div class="box"><b>To shop</b>${esc(d.to_name)}</div>
</div>
<table><thead><tr><th>#</th><th>Item</th><th>Barcode</th><th>Size</th><th>Colour</th>
<th class="r">Qty</th><th class="r">Cost</th><th class="r">Value</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="5">Total</td><td class="r">${totalQty}</td><td></td><td class="r">${money(totalValue)}</td></tr></tfoot>
</table>
${d.notes ? `<p><b>Notes:</b> ${esc(d.notes)}</p>` : ""}
<div class="sign"><div>Sent by ____________________</div><div>Received by ____________________</div></div>
</body></html>`;
}

/* ---------------------------------------------------------------------------
 * Dashboard: send → Receive/Accept flow (20270313120000).
 * Before that SQL runs, rows have no status column: live rows count as
 * accepted, cancelled ones as cancelled.
 * ------------------------------------------------------------------------- */

export type TransferStatus = "pending" | "accepted" | "rejected" | "cancelled";

export interface TransferStatusRow {
  status?: string | null;
  cancelled_at?: string | null;
}

export function transferStatus(row: TransferStatusRow): TransferStatus {
  const s = row.status;
  if (s === "pending" || s === "accepted" || s === "rejected" || s === "cancelled") return s;
  return row.cancelled_at ? "cancelled" : "accepted";
}

export type TransferTagTone = "receive" | "waiting" | "received" | "rejected" | "cancelled";

/** Badge shown in the dashboard. The receiving shop sees "Receive" on a waiting transfer. */
export function transferTag(status: TransferStatus, incoming: boolean): { label: string; tone: TransferTagTone } {
  if (status === "pending") return incoming ? { label: "Receive", tone: "receive" } : { label: "Waiting", tone: "waiting" };
  if (status === "accepted") return { label: "Received", tone: "received" };
  if (status === "rejected") return { label: "Rejected", tone: "rejected" };
  return { label: "Cancelled", tone: "cancelled" };
}

export type TransferStatusFilter = "all" | "receive" | "waiting" | "accepted" | "rejected" | "cancelled";
export type TransferDirectionFilter = "all" | "out" | "in";

export interface TransferListRow extends TransferStatusRow {
  id: string;
  transfer_number: string;
  from_organization_id: string;
  to_organization_id: string;
  transfer_date: string;
  total_qty: number;
  total_value: number;
  notes: string | null;
}

export function filterTransfers<T extends TransferListRow>(
  rows: T[],
  opts: {
    orgId: string;
    status: TransferStatusFilter;
    direction: TransferDirectionFilter;
    search: string;
    shopName: (id: string) => string;
  },
): T[] {
  const term = opts.search.trim().toLowerCase();
  return rows.filter((t) => {
    const incoming = t.to_organization_id === opts.orgId;
    if (opts.direction === "in" && !incoming) return false;
    if (opts.direction === "out" && incoming) return false;
    const st = transferStatus(t);
    if (opts.status === "receive" && !(st === "pending" && incoming)) return false;
    if (opts.status === "waiting" && !(st === "pending" && !incoming)) return false;
    if (opts.status !== "all" && opts.status !== "receive" && opts.status !== "waiting" && st !== opts.status) return false;
    if (!term) return true;
    const other = opts.shopName(incoming ? t.from_organization_id : t.to_organization_id);
    return [t.transfer_number, other, t.notes ?? ""].some((s) => s.toLowerCase().includes(term));
  });
}

export interface TransferKpis {
  toReceive: number;
  toReceiveQty: number;
  waiting: number;
  sentQty: number;
  sentValue: number;
  receivedQty: number;
  receivedValue: number;
}

/** Sent counts everything that left this shop (waiting + received); received only what this shop accepted. */
export function transferKpis(rows: TransferListRow[], orgId: string): TransferKpis {
  const k: TransferKpis = { toReceive: 0, toReceiveQty: 0, waiting: 0, sentQty: 0, sentValue: 0, receivedQty: 0, receivedValue: 0 };
  for (const t of rows) {
    const st = transferStatus(t);
    const incoming = t.to_organization_id === orgId;
    const qty = Number(t.total_qty) || 0;
    const value = Number(t.total_value) || 0;
    if (incoming) {
      if (st === "pending") {
        k.toReceive += 1;
        k.toReceiveQty += qty;
      } else if (st === "accepted") {
        k.receivedQty += qty;
        k.receivedValue += value;
      }
    } else if (st === "pending" || st === "accepted") {
      if (st === "pending") k.waiting += 1;
      k.sentQty += qty;
      k.sentValue += value;
    }
  }
  return k;
}

export type TransferDatePreset = "today" | "week" | "month" | "last_month" | "year" | "all" | "custom";

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** yyyy-MM-dd range for a preset (null = no date limit). Week starts Monday; year is the Apr–Mar financial year. */
export function transferDateRange(
  preset: TransferDatePreset,
  now: Date,
  custom?: { from: string; to: string },
): { from: string; to: string } | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "today":
      return { from: ymd(today), to: ymd(today) };
    case "week": {
      const start = new Date(today);
      start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      return { from: ymd(start), to: ymd(today) };
    }
    case "month":
      return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today) };
    case "last_month":
      return {
        from: ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: ymd(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    case "year": {
      const fyStartYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
      return { from: ymd(new Date(fyStartYear, 3, 1)), to: ymd(today) };
    }
    case "custom":
      return custom?.from && custom?.to ? { from: custom.from, to: custom.to } : null;
    default:
      return null;
  }
}

export interface ReceivedVariantForLabel {
  id: string;
  barcode: string | null;
  size: string | null;
  color: string | null;
  mrp: number | null;
  sale_price: number | null;
  pur_price: number | null;
  products: {
    product_name: string | null;
    brand: string | null;
    category: string | null;
    style: string | null;
    color: string | null;
  } | null;
}

/**
 * Barcode Printing payload for a received transfer: the receiving shop's own items
 * (same barcode as sent), so labels use that shop's name, prices and label design.
 */
export function transferBarcodeItems(
  transferNumber: string,
  lines: Array<{ to_variant_id: string | null; qty: number }>,
  variants: ReceivedVariantForLabel[],
) {
  const byId = new Map(variants.map((v) => [v.id, v]));
  return lines.flatMap((l) => {
    const v = l.to_variant_id ? byId.get(l.to_variant_id) : undefined;
    if (!v) return [];
    return [
      {
        sku_id: v.id,
        product_name: v.products?.product_name ?? "",
        brand: v.products?.brand ?? "",
        category: v.products?.category ?? "",
        color: v.color || v.products?.color || "",
        style: v.products?.style ?? "",
        size: v.size ?? "",
        sale_price: v.sale_price,
        mrp: v.mrp,
        pur_price: v.pur_price,
        barcode: v.barcode ?? "",
        qty: Number(l.qty) || 0,
        bill_number: transferNumber,
        supplier_code: "",
      },
    ];
  });
}
