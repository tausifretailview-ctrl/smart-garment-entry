/**
 * Purchase Entry > Photo: turn what read-purchase-bill returns into editable review rows,
 * check the maths against the bill's printed totals, and hand the rows to the Excel import
 * (purchaseBillFields keys), so product matching, barcodes and product creation stay the
 * same as an Excel import.
 */

/**
 * Photo button on Purchase Entry: on for every shop unless the shop turns it off in
 * Settings > Purchase (purchase_settings.photo_import_enabled = false).
 */
export function isPhotoImportEnabled(purchaseSettings: unknown): boolean {
  return (purchaseSettings as { photo_import_enabled?: boolean } | null | undefined)?.photo_import_enabled !== false;
}
export const PHOTO_IMPORT_MAX_PAGES = 4;
/** Sale price for a new item when the bill prints no MRP: purchase rate + this %. */
export const DEFAULT_PHOTO_MARKUP_PERCENT = 30;

export interface ReadBillLine {
  product_name?: string;
  brand?: string;
  hsn_code?: string;
  size?: string;
  color?: string;
  qty?: number;
  uom?: string;
  rate?: number;
  discount_amount?: number;
  taxable_amount?: number;
  gst_percent?: number;
  mrp?: number;
  barcode?: string;
  unclear?: boolean;
}

export interface ReadBill {
  supplier_name?: string;
  supplier_gstin?: string;
  invoice_no?: string;
  invoice_date?: string;
  other_charges?: number;
  taxable_total?: number;
  gst_total?: number;
  grand_total?: number;
  printed_line_count?: number;
  lines?: ReadBillLine[];
}

export interface PhotoReviewRow {
  key: string;
  product_name: string;
  brand: string;
  category: string;
  style: string;
  color: string;
  size: string;
  hsn_code: string;
  barcode: string;
  uom: string;
  qty: number;
  pur_price: number;
  /** Line amount before GST after discount, as printed (or qty × rate). */
  line_total: number;
  gst_per: number;
  mrp: number;
  sale_price: number;
  unclear: boolean;
  /** Existing product with this name in the shop (by productNameMatchKey). */
  matchedName: string | null;
}

export interface CatalogMatch {
  product_name: string;
  brand: string | null;
  category: string | null;
  style: string | null;
  color: string | null;
  default_sale_price: number | null;
}

export const VALID_GST_RATES = [0, 0.25, 3, 5, 12, 18, 28, 40];

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown) => (v == null ? "" : String(v).trim());
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** New-item sale price: MRP when printed, else purchase rate + markup, rounded to the rupee. */
export function defaultSalePrice(mrp: number, purPrice: number, markupPercent: number): number {
  if (mrp > 0) return mrp;
  if (purPrice <= 0) return 0;
  return Math.round(purPrice * (1 + markupPercent / 100));
}

export function billToReviewRows(
  bill: ReadBill,
  findMatch: (name: string) => CatalogMatch | null,
  markupPercent = DEFAULT_PHOTO_MARKUP_PERCENT,
): PhotoReviewRow[] {
  return (bill.lines ?? [])
    .filter((l) => str(l.product_name))
    .map((l, i) => {
      const qty = num(l.qty);
      const rate = num(l.rate);
      const printed = num(l.taxable_amount);
      const lineTotal = printed > 0 ? printed : round2(qty * rate - num(l.discount_amount));
      const mrp = num(l.mrp);
      const name = str(l.product_name);
      const match = findMatch(name);
      return {
        key: `r${i}`,
        product_name: match?.product_name ?? name,
        brand: str(l.brand) || str(match?.brand),
        category: str(match?.category),
        style: str(match?.style),
        color: str(l.color) || str(match?.color),
        size: str(l.size),
        hsn_code: str(l.hsn_code).replace(/\s/g, ""),
        barcode: str(l.barcode).replace(/\s/g, ""),
        uom: str(l.uom).toUpperCase(),
        qty,
        pur_price: rate,
        line_total: lineTotal,
        gst_per: num(l.gst_percent),
        mrp,
        sale_price:
          match?.default_sale_price && match.default_sale_price > 0 && mrp <= 0
            ? match.default_sale_price
            : defaultSalePrice(mrp, rate, markupPercent),
        unclear: Boolean(l.unclear),
        matchedName: match?.product_name ?? null,
      };
    });
}

/** Problems with one line that staff should look at before importing. */
export function rowIssues(row: PhotoReviewRow): string[] {
  const issues: string[] = [];
  if (!row.product_name.trim()) issues.push("Name missing");
  if (row.qty <= 0) issues.push("Qty missing");
  if (row.pur_price <= 0) issues.push("Rate missing");
  if (row.sale_price <= 0) issues.push("Sale price missing");
  if (!VALID_GST_RATES.includes(row.gst_per)) issues.push(`GST ${row.gst_per}% is not a GST rate`);
  if (row.hsn_code && !/^\d{4,8}$/.test(row.hsn_code)) issues.push("HSN looks wrong");
  if (row.qty > 0 && row.pur_price > 0 && Math.abs(row.qty * row.pur_price - row.line_total) > Math.max(1, row.line_total * 0.35)) {
    issues.push("Qty × rate far from amount");
  }
  if (row.unclear) issues.push("Hard to read");
  return issues;
}

export type CheckLevel = "ok" | "warn";
export interface BillCheck {
  label: string;
  level: CheckLevel;
  detail: string;
}

/** Compare our sums with the bill's printed totals (±₹2 for rounding). */
export function billChecks(bill: ReadBill, rows: PhotoReviewRow[], otherCharges: number): BillCheck[] {
  const checks: BillCheck[] = [];
  const taxable = round2(rows.reduce((s, r) => s + r.line_total, 0));
  const gst = round2(rows.reduce((s, r) => s + round2((r.line_total * r.gst_per) / 100), 0));
  const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  const near = (a: number, b: number) => Math.abs(a - b) <= 2;

  const printedTaxable = num(bill.taxable_total);
  if (printedTaxable > 0) {
    checks.push({
      label: "Taxable total",
      level: near(taxable, printedTaxable) ? "ok" : "warn",
      detail: `Lines add up to ${fmt(taxable)}, bill says ${fmt(printedTaxable)}`,
    });
  }
  const printedGst = num(bill.gst_total);
  if (printedGst > 0) {
    checks.push({
      label: "GST",
      level: near(gst, printedGst) ? "ok" : "warn",
      detail: `Our GST ${fmt(gst)}, bill says ${fmt(printedGst)}`,
    });
  }
  const printedGrand = num(bill.grand_total);
  if (printedGrand > 0) {
    const ours = Math.round(taxable + gst + otherCharges);
    checks.push({
      label: "Bill total",
      level: Math.abs(ours - printedGrand) <= 2 ? "ok" : "warn",
      detail: `Our total ${fmt(ours)}, bill says ${fmt(printedGrand)}`,
    });
  }
  const printedCount = num(bill.printed_line_count);
  if (printedCount > 0) {
    checks.push({
      label: "Lines",
      level: printedCount === rows.length ? "ok" : "warn",
      detail: `${rows.length} lines read, bill says ${printedCount}`,
    });
  }
  const flagged = rows.filter((r) => rowIssues(r).length > 0).length;
  checks.push({
    label: "Line checks",
    level: flagged ? "warn" : "ok",
    detail: flagged ? `${flagged} line${flagged > 1 ? "s" : ""} to check (marked in amber)` : "Every line looks complete",
  });
  return checks;
}

/** Rows in the Excel import shape (purchaseBillFields); bill fields go on the first row. */
export function reviewRowsToImportRows(
  rows: PhotoReviewRow[],
  header: { supplierName: string; invoiceNo: string; billDate: string; otherCharges: number },
): Record<string, unknown>[] {
  return rows.map((r, i) => ({
    ...(i === 0
      ? {
          bill_supplier_name: header.supplierName || undefined,
          bill_supplier_invoice_no: header.invoiceNo || undefined,
          bill_date: header.billDate || undefined,
          bill_other_charges: header.otherCharges > 0 ? header.otherCharges : undefined,
        }
      : {}),
    product_name: r.product_name.trim(),
    category: r.category || undefined,
    brand: r.brand || undefined,
    style: r.style || undefined,
    color: r.color || undefined,
    hsn_code: r.hsn_code || undefined,
    gst_per: r.gst_per,
    uom: r.uom || undefined,
    size: r.size || undefined,
    barcode: r.barcode || undefined,
    pur_price: r.pur_price,
    sale_price: r.sale_price,
    qty: r.qty,
    line_total: r.line_total > 0 ? r.line_total : undefined,
    mrp: r.mrp > 0 ? r.mrp : undefined,
  }));
}

/** Shrinks a photo to ~1600 px on the long side as JPEG (smaller upload, cheaper AI read). */
export async function shrinkBillPhoto(file: File, maxSide = 1600, quality = 0.8): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the photo");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}
