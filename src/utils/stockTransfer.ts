/** Stock transfer between sibling shops (same owner, separate organizations). */

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
${d.cancelled ? `<div class="cancel">CANCELLED</div>` : ""}
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
