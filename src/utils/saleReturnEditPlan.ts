/**
 * Sale Return edit helpers.
 *
 * Editing a saved return used to delete and re-insert every line and run the
 * stock-ceiling check with the full line qty, as if it were a new return. The
 * return's own stock was still counted in stock_qty, so a header-only edit
 * (e.g. adding the customer later) failed with "Stock Ceiling Exceeded".
 */

export type SaleReturnEditLine = {
  productId?: string | null;
  variantId?: string | null;
  productName?: string | null;
  size?: string | null;
  color?: string | null;
  barcode?: string | null;
  quantity: number;
  unitPrice: number;
  gstPercent: number;
  lineTotal: number;
  hsnCode?: string | null;
};

const num = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;
const str = (v: unknown) => String(v ?? "").trim();

function lineKey(l: SaleReturnEditLine): string {
  return [
    str(l.productId),
    str(l.variantId),
    str(l.productName),
    str(l.size),
    str(l.color),
    str(l.barcode),
    num(l.quantity),
    num(l.unitPrice),
    num(l.gstPercent),
    num(l.lineTotal),
    str(l.hsnCode),
  ].join("|");
}

/** True when the edited lines are the same as the saved lines (order ignored). */
export function saleReturnLinesUnchanged(
  original: SaleReturnEditLine[],
  current: SaleReturnEditLine[],
): boolean {
  if (original.length !== current.length) return false;
  const a = original.map(lineKey).sort();
  const b = current.map(lineKey).sort();
  return a.every((k, i) => k === b[i]);
}

/**
 * Extra stock each variant gets from this edit (new qty − saved qty).
 * Only positive increases need the stock-ceiling check.
 */
export function saleReturnStockIncreaseByVariant(
  original: SaleReturnEditLine[],
  current: SaleReturnEditLine[],
): Map<string, number> {
  const delta = new Map<string, number>();
  for (const l of current) {
    const v = str(l.variantId);
    if (!v) continue;
    delta.set(v, (delta.get(v) || 0) + (Number(l.quantity) || 0));
  }
  for (const l of original) {
    const v = str(l.variantId);
    if (!v) continue;
    delta.set(v, (delta.get(v) || 0) - (Number(l.quantity) || 0));
  }
  for (const [v, q] of delta) {
    if (q <= 0) delta.delete(v);
  }
  return delta;
}

export type SaleReturnCreditState = {
  customer_id?: string | null;
  credit_status?: string | null;
  linked_sale_id?: string | null;
  refund_type?: string | null;
  creditNoteUsed?: number | null;
};

/**
 * A return's customer can be set or changed only while its credit is still
 * unused. Once it was adjusted on a bill or refunded, moving it to another
 * customer would show that credit again in the new customer's balance.
 */
export function canChangeSaleReturnCustomer(sr: SaleReturnCreditState): boolean {
  const status = str(sr.credit_status).toLowerCase();
  if (str(sr.linked_sale_id)) return false;
  if (str(sr.refund_type).toLowerCase() === "cash_refund") return false;
  if (status && status !== "pending") return false;
  if ((Number(sr.creditNoteUsed) || 0) > 0.005) return false;
  return true;
}
